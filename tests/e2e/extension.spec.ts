import { chromium, test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
test('bundled content adapter traverses same-origin fixture folders and leaves failed pages diagnosable', async ({
  page,
}) => {
  const course = await readFile(
    'tests/fixtures/ilias-course-modern.html',
    'utf8',
  );
  const folder = await readFile(
    'tests/fixtures/ilias-folder-legacy.html',
    'utf8',
  );
  const requested: string[] = [];
  await page.route('https://ilias.studium.kit.edu/**', async (route) => {
    requested.push(route.request().url());
    await route.fulfill({
      contentType: 'text/html',
      body: route.request().url().includes('/fold/300') ? folder : course,
    });
  });
  await page.goto('https://ilias.studium.kit.edu/goto.php/crs/100');
  await page.addScriptTag({ path: resolve('apps/extension/dist/content.js') });
  const snapshots = await page.evaluate(() =>
    window.__backOnTrackExtract!(true),
  );
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1]!.category).toBe('Übungen');
  expect(snapshots[1]!.course!.id).toBe('kit:crs:100');
  expect(JSON.stringify(snapshots)).not.toContain('secret');
  expect(
    requested.every(
      (u) => new URL(u).origin === 'https://ilias.studium.kit.edu',
    ),
  ).toBe(true);
  await page.route(
    'https://ilias.studium.kit.edu/goto.php/fold/300',
    async (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<input type="password">',
      }),
  );
  const failed = await page.evaluate(() => window.__backOnTrackExtract!(true));
  expect(failed).toHaveLength(1);
  expect(failed[0]!.warnings.join(' ')).toContain('Seite nicht gelesen');
});
test('built MV3 extension mediates a versioned import with explicit website approval', async () => {
  const extensionPath = resolve('apps/extension/dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    const payload = {
      kind: 'back-on-track/ilias',
      version: 1,
      exportedAt: '2026-10-27T10:00:00.000Z',
      courses: [
        {
          id: 'kit:crs:1',
          title: 'MV3 Import',
          url: 'https://ilias.studium.kit.edu/goto.php/crs/1',
          items: [
            {
              id: 'kit:file:2',
              title: 'Material aus Erweiterung',
              url: 'https://ilias.studium.kit.edu/goto.php/file/2',
              uploadedOn: null,
              category: null,
            },
          ],
        },
      ],
      diagnostics: [],
    };
    await worker.evaluate(async (data) => {
      await chrome.storage.local.set({ pending: data });
    }, payload);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#extension-id')).toHaveText(extensionId);
    await expect(
      popup.getByRole('button', { name: 'JSON exportieren' }),
    ).toBeEnabled();
    const page = await context.newPage();
    await page.goto('http://localhost:5173');
    await page
      .getByRole('button', { name: 'Import & Backup', exact: true })
      .first()
      .click();
    await page.getByLabel('Erweiterungs-ID').fill(extensionId);
    await page
      .getByRole('button', { name: 'Sync von ILIAS', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const before = await page.evaluate(() =>
      localStorage.getItem('back-on-track:v1:local'),
    );
    expect(before).toBeNull();
    await page
      .getByRole('button', { name: 'Import freigeben', exact: true })
      .click();
    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('back-on-track:v1:local')!),
    );
    expect(state.courses[0].items[0].title).toBe('Material aus Erweiterung');
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
  } finally {
    await context.close();
  }
});
