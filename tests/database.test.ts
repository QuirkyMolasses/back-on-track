import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { emptyWorkspace, workspaceSchema } from '../packages/domain/src/index';
import { fixtureCourse } from './helpers';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const db = new PGlite();
const c = fixtureCourse();
const document = { ...emptyWorkspace(), courses: [c] };
async function asUser(user: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
}
async function save(payload: unknown, revision: number) {
  return db.query<{ revision: number }>(
    'select public.save_workspace($1::jsonb,$2) as revision',
    [JSON.stringify(payload), revision],
  );
}
beforeAll(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key); grant usage on schema auth,public to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    insert into auth.users(id) values('${alice}'),('${bob}');`);
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/202610270001_workspace.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe('actual PostgreSQL migration, RLS and transactional sync (PGlite)', () => {
  it('saves and loads a complete workspace under authenticated RLS', async () => {
    await asUser(alice);
    expect((await save(document, 0)).rows[0]!.revision).toBe(1);
    const result = await db.query<{
      data: { workspace: unknown; revision: number };
    }>('select public.load_workspace() as data');
    expect(result.rows[0]!.data.revision).toBe(1);
    expect(workspaceSchema.parse(result.rows[0]!.data.workspace)).toEqual(
      document,
    );
  });
  it('isolates all five private tables between two users', async () => {
    await asUser(bob);
    for (const table of [
      'workspaces',
      'courses',
      'categories',
      'learning_items',
      'sync_events',
    ]) {
      const result = await db.query(`select * from public.${table}`);
      expect(result.rows).toEqual([]);
    }
    const result = await db.query<{
      data: { revision: number; workspace: unknown };
    }>('select public.load_workspace() as data');
    expect(result.rows[0]!.data).toEqual({ revision: 0, workspace: null });
  });
  it('rejects owner spoofing on inserts', async () => {
    await asUser(bob);
    await expect(
      db.query(
        'insert into public.workspaces(user_id,preferences) values($1,$2::jsonb)',
        [alice, JSON.stringify(document.preferences)],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it('does not allow another user to update or delete private courses', async () => {
    await asUser(bob);
    const update = await db.query(
      'update public.courses set name=$1 where id=$2 returning id',
      ['Stolen', c.id],
    );
    expect(update.rows).toHaveLength(0);
    const deletion = await db.query(
      'delete from public.courses where id=$1 returning id',
      [c.id],
    );
    expect(deletion.rows).toHaveLength(0);
  });
  it('rejects cross-owner category references via composite foreign keys', async () => {
    await asUser(bob);
    await expect(
      db.query(
        'insert into public.categories(id,user_id,course_id,name,weight,sort_order) values($1,$2,$3,$4,1,0)',
        [crypto.randomUUID(), bob, c.id, 'Injected'],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it('rejects stale revisions before replacing data', async () => {
    await asUser(alice);
    await expect(save({ ...document, courses: [] }, 0)).rejects.toThrow(
      'revision_conflict',
    );
    expect((await db.query('select * from public.courses')).rows).toHaveLength(
      1,
    );
  });
  it('rolls back replacement if any constraint fails', async () => {
    await asUser(alice);
    const invalid = structuredClone(document);
    invalid.courses[0]!.items[0]!.completion = 1.5;
    await expect(save(invalid, 1)).rejects.toThrow(/check constraint/);
    const rows = await db.query<{ completion: string }>(
      'select completion from public.learning_items',
    );
    expect(Number(rows.rows[0]!.completion)).toBe(0.6);
    expect(
      (
        await db.query<{ revision: number }>(
          'select revision from public.workspaces',
        )
      ).rows[0]!.revision,
    ).toBe(1);
  });
  it('lets another user save an independent workspace', async () => {
    await asUser(bob);
    const mine = { ...emptyWorkspace(), courses: [fixtureCourse()] };
    expect((await save(mine, 0)).rows[0]!.revision).toBe(1);
    expect((await db.query('select * from public.courses')).rows).toHaveLength(
      1,
    );
  });
  it('prevents changing the owner of an existing row', async () => {
    await asUser(alice);
    await expect(
      db.query('update public.courses set user_id=$1 where id=$2', [bob, c.id]),
    ).rejects.toThrow(/row-level security/);
  });
  it('roundtrips source metadata, overrides and historical deleted-course references', async () => {
    await asUser(alice);
    const snapshot = structuredClone(document);
    snapshot.courses[0]!.lastSyncAt = '2026-01-24T12:00:00.000Z';
    snapshot.courses[0]!.items[0]!.source = {
      id: 'kit:file:99',
      url: 'https://ilias.studium.kit.edu/goto.php/file/99',
      title: 'Quelltitel',
      category: null,
      uploadedOn: '2026-01-24',
    };
    snapshot.courses[0]!.items[0]!.overrides = ['title', 'relevant'];
    snapshot.history = [
      {
        id: crypto.randomUUID(),
        at: '2026-01-24T12:00:00.000Z',
        courseId: c.id,
        added: 1,
        updated: 0,
        warnings: ['Datum prüfen'],
      },
    ];
    expect((await save(snapshot, 1)).rows[0]!.revision).toBe(2);
    const first = await db.query<{ data: { workspace: unknown } }>(
      'select public.load_workspace() as data',
    );
    expect(workspaceSchema.parse(first.rows[0]!.data.workspace)).toEqual(
      snapshot,
    );
    snapshot.courses = [];
    expect((await save(snapshot, 2)).rows[0]!.revision).toBe(3);
    const deleted = await db.query<{ data: { workspace: unknown } }>(
      'select public.load_workspace() as data',
    );
    expect(workspaceSchema.parse(deleted.rows[0]!.data.workspace)).toEqual(
      snapshot,
    );
  });
  it('requires authentication for both RPCs and all tables', async () => {
    await db.exec('reset role;set role anon;');
    await expect(db.query('select public.load_workspace()')).rejects.toThrow(
      'permission denied',
    );
    await expect(
      db.query('select public.save_workspace($1::jsonb,0)', [
        JSON.stringify(document),
      ]),
    ).rejects.toThrow('permission denied');
    await expect(db.query('select * from public.courses')).rejects.toThrow(
      'permission denied',
    );
  });
});
