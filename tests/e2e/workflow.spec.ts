import { test, expect } from '@playwright/test';
test('create course, custom category, partial progress, switch modes and inspect dashboard', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Kurs anlegen', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kursname').fill('Lineare Algebra');
  await dialog.getByLabel('Planungsbeginn').fill('2026-01-01');
  await dialog.getByLabel('Prüfungsdatum').fill('2026-02-07');
  await dialog
    .getByRole('button', { name: 'Kurs anlegen', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lineare Algebra' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Kategorie hinzufügen', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kategorie', { exact: true }).fill('Beweise üben');
  await dialog.getByLabel('Gewicht', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await page
    .getByRole('textbox', { name: 'Kategorie 1', exact: true })
    .fill('Beweise und Definitionen');
  await page.getByRole('heading', { level: 1 }).click();
  await expect(
    page.getByRole('textbox', { name: 'Kategorie 1', exact: true }),
  ).toHaveValue('Beweise und Definitionen');
  await page
    .getByRole('button', { name: 'Material hinzufügen', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel', { exact: true }).fill('Vektorräume');
  await dialog.getByLabel('Upload-Datum').fill('2026-01-24');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await page
    .getByRole('spinbutton', { name: 'Fortschritt: Vektorräume' })
    .fill('60');
  await expect(
    page.getByRole('progressbar', { name: 'Erledigt' }),
  ).toHaveAttribute('aria-valuenow', '60');
  await page.getByRole('button', { name: 'Dranbleiben', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Dranbleiben', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: 'Erledigt: Vektorräume' }).check();
  await expect(
    page.getByRole('progressbar', { name: 'Erledigt' }),
  ).toHaveAttribute('aria-valuenow', '100');
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Erledigt: Vektorräume' }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Zur Übersicht', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Alles im Blick.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Lineare Algebra', level: 3 }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({
    path: testInfo.outputPath('dashboard.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Darstellung', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: testInfo.outputPath('dashboard-dark.png'),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
test('reviews JSON import, preserves progress on repeat import and validates unsafe data', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Import & Backup', exact: true })
    .first()
    .click();
  const payload = {
    kind: 'back-on-track/ilias',
    version: 1,
    exportedAt: '2026-10-27T10:00:00.000Z',
    courses: [
      {
        id: 'kit:crs:1',
        title: 'Testimport',
        url: 'https://ilias.studium.kit.edu/goto.php/crs/1',
        items: [
          {
            id: 'kit:file:2',
            title: 'Übung 1',
            url: 'https://ilias.studium.kit.edu/goto.php/file/2',
            uploadedOn: '2026-10-26',
            category: null,
          },
        ],
      },
    ],
    diagnostics: [],
  };
  async function upload() {
    await page.locator('input[type=file]').setInputFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await page
      .getByRole('button', { name: 'Import freigeben', exact: true })
      .click();
  }
  await upload();
  await page.getByRole('button', { name: 'Übersicht', exact: true }).click();
  await page.locator('.course-card').filter({ hasText: 'Testimport' }).click();
  await page
    .getByRole('spinbutton', { name: 'Fortschritt: Übung 1' })
    .fill('75');
  await page
    .getByRole('button', { name: 'Zur Übersicht', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Import & Backup', exact: true })
    .first()
    .click();
  await upload();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('back-on-track:v1:local')!),
  );
  expect(state.courses).toHaveLength(1);
  expect(state.courses[0].items).toHaveLength(1);
  expect(state.courses[0].items[0].completion).toBe(0.75);
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":9000}'),
  });
  await expect(page.getByRole('alert')).toContainText('Ungültige Datei');
});
