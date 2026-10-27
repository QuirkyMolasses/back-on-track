import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const names = [
  'SUPABASE_TEST_URL',
  'SUPABASE_TEST_ANON_KEY',
  'SUPABASE_TEST_A_EMAIL',
  'SUPABASE_TEST_A_PASSWORD',
  'SUPABASE_TEST_B_EMAIL',
  'SUPABASE_TEST_B_PASSWORD',
];
if (names.some((name) => !process.env[name]))
  throw new Error(
    `Provide all required test variables: ${names.join(', ')}. Use dedicated test accounts.`,
  );
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const a = createClient(
  process.env.SUPABASE_TEST_URL,
  process.env.SUPABASE_TEST_ANON_KEY,
  options,
);
const b = createClient(
  process.env.SUPABASE_TEST_URL,
  process.env.SUPABASE_TEST_ANON_KEY,
  options,
);
const courseId = randomUUID();
const categoryId = randomUUID();
const itemId = randomUUID();
function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
try {
  const userA = checked(
    await a.auth.signInWithPassword({
      email: process.env.SUPABASE_TEST_A_EMAIL,
      password: process.env.SUPABASE_TEST_A_PASSWORD,
    }),
  ).user;
  const userB = checked(
    await b.auth.signInWithPassword({
      email: process.env.SUPABASE_TEST_B_EMAIL,
      password: process.env.SUPABASE_TEST_B_PASSWORD,
    }),
  ).user;
  assert.notEqual(userA.id, userB.id, 'Use two different accounts');
  checked(
    await a.from('courses').insert({
      id: courseId,
      user_id: userA.id,
      name: 'Temporary authorization smoke test',
      start_date: '2026-01-01',
      buffer_days: 7,
      follow_up_days: 7,
      mode: 'exam',
    }),
  );
  checked(
    await a.from('categories').insert({
      id: categoryId,
      course_id: courseId,
      user_id: userA.id,
      name: 'Temporary category',
      weight: 3,
      sort_order: 0,
    }),
  );
  checked(
    await a.from('learning_items').insert({
      id: itemId,
      course_id: courseId,
      category_id: categoryId,
      user_id: userA.id,
      title: 'Temporary item',
      completion: 0.5,
      relevant: true,
    }),
  );
  assert.equal(
    checked(
      await a.from('learning_items').select('id,completion').eq('id', itemId),
    ).length,
    1,
  );
  for (const [table, id] of [
    ['courses', courseId],
    ['categories', categoryId],
    ['learning_items', itemId],
  ])
    assert.equal(
      checked(await b.from(table).select('id').eq('id', id)).length,
      0,
    );
  assert.equal(
    checked(
      await b
        .from('learning_items')
        .update({ completion: 1 })
        .eq('id', itemId)
        .select('id'),
    ).length,
    0,
  );
  assert.equal(
    checked(
      await a.from('learning_items').select('completion').eq('id', itemId),
    )[0].completion,
    0.5,
  );
  const spoof = await b.from('categories').insert({
    id: randomUUID(),
    course_id: courseId,
    user_id: userB.id,
    name: 'Forbidden reference',
    weight: 1,
    sort_order: 0,
  });
  assert.ok(spoof.error, 'Cross-owner foreign key must reject insertion');
  console.log(
    'PASS: hosted Supabase authentication, SDK CRUD, two-account isolation, mutation denial and cross-owner foreign keys.',
  );
} finally {
  const cleanup = await a.from('courses').delete().eq('id', courseId);
  if (cleanup.error)
    console.error(
      'Temporary record cleanup failed; remove only the temporary smoke-test course in the test account.',
    );
  await Promise.all([a.auth.signOut(), b.auth.signOut()]);
}
