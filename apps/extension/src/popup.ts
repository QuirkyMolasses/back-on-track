import {
  importSchema,
  type ImportPayload,
} from '../../../packages/domain/src/index';
import {
  KIT_ORIGIN,
  snapshotsToImport,
  type PageSnapshot,
} from '../../../packages/ilias/src/index';
declare const __APP_ORIGIN__: string;
const status = document.querySelector<HTMLElement>('#status')!;
const scan = document.querySelector<HTMLButtonElement>('#scan')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
document.querySelector<HTMLElement>('#extension-id')!.textContent =
  chrome.runtime.id;
document.querySelector<HTMLAnchorElement>('#app')!.href = __APP_ORIGIN__;
let payload: ImportPayload | null = null;
void chrome.storage.local.get('pending').then(({ pending }) => {
  const p = importSchema.safeParse(pending);
  if (p.success) {
    payload = p.data;
    download.disabled = false;
  }
});
scan.addEventListener('click', () => {
  void (async () => {
    scan.disabled = true;
    status.textContent = 'ILIAS wird gelesen …';
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url || new URL(tab.url).origin !== KIT_ORIGIN)
        throw new Error(
          'Öffne zuerst eine KIT-ILIAS-Kursseite und melde dich dort an.',
        );
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      const nested =
        document.querySelector<HTMLInputElement>('#nested')!.checked;
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (deep: boolean) => {
          if (!window.__backOnTrackExtract) throw new Error('Adapter fehlt');
          return window.__backOnTrackExtract(deep);
        },
        args: [nested],
      });
      const pages = result[0]?.result as PageSnapshot[] | undefined;
      if (!pages?.length) throw new Error('Seite konnte nicht gelesen werden.');
      payload = snapshotsToImport(pages, new Date().toISOString());
      await chrome.storage.local.set({ pending: payload });
      download.disabled = false;
      status.textContent = `${payload.courses.length} Kurszuordnungen, ${payload.courses.reduce((n, c) => n + c.items.length, 0)} Materialien. In Back on Track prüfen und freigeben. ${payload.diagnostics.join(' ')}`;
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : 'Import fehlgeschlagen';
    } finally {
      scan.disabled = false;
    }
  })();
});
download.addEventListener('click', () => {
  if (!payload) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'back-on-track-ilias.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector('#clear')!.addEventListener('click', () => {
  void chrome.storage.local.remove('pending');
  payload = null;
  download.disabled = true;
  status.textContent = 'Lokale Importdaten gelöscht.';
});
