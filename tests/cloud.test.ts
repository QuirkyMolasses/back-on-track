import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../packages/domain/src/index';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function setup(body: unknown, status = 200) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  const persistence = await import('../apps/web/src/persistence');
  return { ...persistence, fetch };
}
describe('Supabase SDK RPC boundary', () => {
  it('uploads validated state with the expected revision through the real SDK', async () => {
    const { saveCloud, fetch } = await setup(4);
    expect(await saveCloud(emptyWorkspace(), 3)).toBe(4);
    expect(String(fetch.mock.calls[0]![0])).toContain(
      '/rest/v1/rpc/save_workspace',
    );
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      payload: emptyWorkspace(),
      expected_revision: 3,
    });
  });
  it('validates the cloud response before replacing local data', async () => {
    const { loadCloud } = await setup({
      revision: 1,
      workspace: { invalid: true },
    });
    await expect(loadCloud()).rejects.toThrow();
  });
  it('surfaces optimistic concurrency conflicts', async () => {
    const { saveCloud } = await setup(
      { message: 'revision_conflict', code: 'P0001' },
      400,
    );
    await expect(saveCloud(emptyWorkspace(), 0)).rejects.toThrow(
      'Cloud-Konflikt',
    );
  });
  it('roundtrips a valid cloud workspace', async () => {
    const result = { revision: 4, workspace: emptyWorkspace() };
    const { loadCloud } = await setup(result);
    expect(await loadCloud()).toEqual(result);
  });
});
