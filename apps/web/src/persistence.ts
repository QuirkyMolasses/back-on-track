import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  workspaceSchema,
  emptyWorkspace,
  type Workspace,
} from '../../../packages/domain/src/index';
export const cloud =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
export function loadLocal(key: string): {
  workspace: Workspace;
  error: string | null;
} {
  const text = localStorage.getItem(key);
  if (!text) return { workspace: emptyWorkspace(), error: null };
  try {
    return { workspace: workspaceSchema.parse(JSON.parse(text)), error: null };
  } catch {
    return {
      workspace: emptyWorkspace(),
      error: `Lokale Daten ungültig. Original bleibt unter „${key}“ erhalten. Importiere ein gültiges Backup, bevor du weiterarbeitest.`,
    };
  }
}
export function saveLocal(key: string, workspace: Workspace) {
  localStorage.setItem(key, JSON.stringify(workspaceSchema.parse(workspace)));
}
const remoteSchema = z.object({
  revision: z.number().int().nonnegative(),
  workspace: workspaceSchema.nullable(),
});
export async function loadCloud() {
  if (!cloud) throw new Error('Supabase nicht konfiguriert');
  const { data, error } = await cloud.rpc('load_workspace');
  if (error) throw error;
  return remoteSchema.parse(data);
}
export async function saveCloud(
  workspace: Workspace,
  revision: number,
): Promise<number> {
  if (!cloud) throw new Error('Supabase nicht konfiguriert');
  const { data, error } = await cloud.rpc('save_workspace', {
    payload: workspaceSchema.parse(workspace),
    expected_revision: revision,
  });
  if (error)
    throw new Error(
      error.message.includes('revision_conflict')
        ? 'Cloud-Konflikt: Cloud-Daten wurden geändert. Lokales Backup herunterladen und Cloud neu laden.'
        : error.message,
    );
  return z.number().int().positive().parse(data);
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
