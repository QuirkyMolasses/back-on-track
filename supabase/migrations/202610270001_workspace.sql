-- Atomic per-user snapshots with optimistic concurrency. No service-role browser key.
create table public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object'
    and preferences ?& array['theme','locale','rules'] and preferences->>'theme' in ('light','dark','system')
    and preferences->>'locale' in ('de','en')
    and jsonb_typeof(preferences->'rules') = 'array'
    and jsonb_array_length(preferences->'rules') <= 100),
  updated_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 300),
  description text not null default '' check (length(description) <= 3000),
  start_date date not null check (start_date >= '1900-01-01'),
  exam_date date check (exam_date >= '1900-01-01'),
  buffer_days integer not null check (buffer_days between 0 and 730),
  follow_up_days integer not null check (follow_up_days between 0 and 730),
  mode text not null check (mode in ('exam','track')),
  source_id text check (length(source_id) <= 200),
  source_url text check (source_url ~ '^https://ilias\.studium\.kit\.edu/(goto\.php/[a-z]+/[0-9]+|ilias\.php\?baseClass=ilrepositorygui&ref_id=[0-9]+|)$'),
  last_sync_at timestamptz,
  unique(id,user_id)
);
create index courses_owner on public.courses(user_id);
create table public.categories (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 300),
  weight numeric not null check (weight >= 0 and weight <= 10000),
  sort_order integer not null check (sort_order >= 0),
  foreign key(course_id,user_id) references public.courses(id,user_id) on delete cascade,
  unique(id,course_id,user_id)
);
create index categories_owner_course on public.categories(user_id,course_id);
create table public.learning_items (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null, category_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 300),
  completion numeric not null check (completion >= 0 and completion <= 1),
  weight_override numeric check (weight_override >= 0 and weight_override <= 10000),
  relevant boolean not null,
  uploaded_on date check (uploaded_on >= '1900-01-01'),
  source jsonb check (source is null or (jsonb_typeof(source) = 'object'
    and source ?& array['id','url','title','category','uploadedOn'] and length(source->>'id') between 1 and 200
    and source->>'url' ~ '^https://ilias\.studium\.kit\.edu/goto\.php/[a-z]+/[0-9]+$')),
  source_id text generated always as (source->>'id') stored,
  overrides text[] not null default '{}' check (overrides <@ array['title','categoryId','relevant','uploadedOn']::text[]),
  foreign key(course_id,user_id) references public.courses(id,user_id) on delete cascade,
  foreign key(category_id,course_id,user_id) references public.categories(id,course_id,user_id) on delete cascade,
  unique(course_id,source_id)
);
create index items_owner_course on public.learning_items(user_id,course_id);
create index items_category on public.learning_items(category_id,course_id,user_id);
create table public.sync_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid, original_course_id uuid not null,
  synced_at timestamptz not null,
  added integer not null check (added >= 0), updated integer not null check (updated >= 0),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array' and jsonb_array_length(warnings) <= 500),
  foreign key(course_id,user_id) references public.courses(id,user_id) on delete set null (course_id)
);
create index sync_owner_time on public.sync_events(user_id,synced_at desc);

alter table public.workspaces enable row level security;
alter table public.courses enable row level security;
alter table public.categories enable row level security;
alter table public.learning_items enable row level security;
alter table public.sync_events enable row level security;
create policy own_workspace on public.workspaces to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_courses on public.courses to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_categories on public.categories to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_items on public.learning_items to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_sync on public.sync_events to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.workspaces,public.courses,public.categories,public.learning_items,public.sync_events from anon;
grant select,insert,update,delete on public.workspaces,public.courses,public.categories,public.learning_items,public.sync_events to authenticated;

create function public.save_workspace(payload jsonb, expected_revision bigint) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); current_revision bigint; c jsonb; cat jsonb; item jsonb; event jsonb;
begin
  if owner_id is null then raise exception 'authentication_required'; end if;
  if (payload->>'version')::integer is distinct from 1 or jsonb_typeof(payload->'courses') is distinct from 'array'
    or jsonb_typeof(payload->'history') is distinct from 'array'
    or jsonb_array_length(payload->'courses') > 500 or jsonb_array_length(payload->'history') > 100
    or octet_length(payload::text) > 5000000 then raise exception 'invalid_workspace'; end if;
  insert into public.workspaces(user_id,preferences) values(owner_id,payload->'preferences') on conflict(user_id) do nothing;
  select revision into current_revision from public.workspaces where user_id=owner_id for update;
  if current_revision is distinct from expected_revision then raise exception 'revision_conflict'; end if;
  delete from public.sync_events where user_id=owner_id;
  delete from public.courses where user_id=owner_id;
  for c in select value from jsonb_array_elements(payload->'courses') loop
    if jsonb_typeof(c->'categories') is distinct from 'array' or jsonb_typeof(c->'items') is distinct from 'array'
      or jsonb_array_length(c->'categories') > 100 or jsonb_array_length(c->'items') > 10000 then raise exception 'invalid_course'; end if;
    insert into public.courses(id,user_id,name,description,start_date,exam_date,buffer_days,follow_up_days,mode,source_id,source_url,last_sync_at)
    values((c->>'id')::uuid,owner_id,c->>'name',c->>'description',(c->>'startDate')::date,(c->>'examDate')::date,
      (c->>'bufferDays')::integer,(c->>'followUpDays')::integer,c->>'mode',c->>'sourceId',c->>'sourceUrl',(c->>'lastSyncAt')::timestamptz);
    for cat in select value from jsonb_array_elements(c->'categories') loop
      insert into public.categories(id,user_id,course_id,name,weight,sort_order)
      values((cat->>'id')::uuid,owner_id,(c->>'id')::uuid,cat->>'name',(cat->>'weight')::numeric,(cat->>'order')::integer);
    end loop;
    for item in select value from jsonb_array_elements(c->'items') loop
      insert into public.learning_items(id,user_id,course_id,category_id,title,completion,weight_override,relevant,uploaded_on,source,overrides)
      values((item->>'id')::uuid,owner_id,(c->>'id')::uuid,(item->>'categoryId')::uuid,item->>'title',(item->>'completion')::numeric,
        (item->>'weightOverride')::numeric,(item->>'relevant')::boolean,(item->>'uploadedOn')::date,nullif(item->'source','null'::jsonb),
        array(select jsonb_array_elements_text(item->'overrides')));
    end loop;
  end loop;
  for event in select value from jsonb_array_elements(payload->'history') loop
    insert into public.sync_events(id,user_id,course_id,original_course_id,synced_at,added,updated,warnings)
    values((event->>'id')::uuid,owner_id,(select id from public.courses where id=(event->>'courseId')::uuid and user_id=owner_id),
      (event->>'courseId')::uuid,(event->>'at')::timestamptz,(event->>'added')::integer,(event->>'updated')::integer,event->'warnings');
  end loop;
  update public.workspaces set revision=current_revision+1,preferences=payload->'preferences',updated_at=now() where user_id=owner_id;
  return current_revision+1;
end $$;

create function public.load_workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce((select jsonb_build_object('revision',w.revision,'workspace',jsonb_build_object(
    'version',1,'preferences',w.preferences,
    'courses',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'name',c.name,'description',c.description,'startDate',c.start_date,'examDate',c.exam_date,
      'bufferDays',c.buffer_days,'followUpDays',c.follow_up_days,'mode',c.mode,'sourceId',c.source_id,'sourceUrl',c.source_url,
      'lastSyncAt',case when c.last_sync_at is null then null else to_char(c.last_sync_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'categories',coalesce((select jsonb_agg(jsonb_build_object('id',cat.id,'name',cat.name,'weight',cat.weight,'order',cat.sort_order) order by cat.sort_order,cat.id)
        from public.categories cat where cat.course_id=c.id and cat.user_id=auth.uid()),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'categoryId',i.category_id,'completion',i.completion,
        'weightOverride',i.weight_override,'relevant',i.relevant,'uploadedOn',i.uploaded_on,'source',i.source,'overrides',to_jsonb(i.overrides)) order by i.id)
        from public.learning_items i where i.course_id=c.id and i.user_id=auth.uid()),'[]'::jsonb)
      ) order by c.name,c.id) from public.courses c where c.user_id=auth.uid()),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'at',to_char(s.synced_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'courseId',s.original_course_id,'added',s.added,'updated',s.updated,'warnings',s.warnings) order by s.synced_at desc,s.id)
      from public.sync_events s where s.user_id=auth.uid()),'[]'::jsonb)
    )) from public.workspaces w where w.user_id=auth.uid()),jsonb_build_object('revision',0,'workspace',null));
$$;
revoke all on function public.save_workspace(jsonb,bigint),public.load_workspace() from public,anon;
grant execute on function public.save_workspace(jsonb,bigint),public.load_workspace() to authenticated;
