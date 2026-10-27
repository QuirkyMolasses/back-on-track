// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractPage,
  identifyLink,
  KIT_ORIGIN,
  snapshotsToImport,
} from '../packages/ilias/src/index';
const fixture = (name: string) =>
  new DOMParser().parseFromString(
    readFileSync(resolve('tests/fixtures', name), 'utf8'),
    'text/html',
  );
describe('modular ILIAS link adapter', () => {
  it('retains a sanitized current-page reference when a type is unknown', () => {
    const page = extractPage(
      new DOMParser().parseFromString('<h1>Mein Ordner</h1>', 'text/html'),
      `${KIT_ORIGIN}/ilias.php?ref_id=123&cmd=show&token=secret`,
    );
    expect(page.url).toBe(
      `${KIT_ORIGIN}/ilias.php?baseClass=ilrepositorygui&ref_id=123`,
    );
    expect(
      snapshotsToImport([page], new Date().toISOString()).courses[0]!.url,
    ).toBe(page.url);
  });
  it('understands observed public KIT links without inventing materials from categories', () => {
    const page = extractPage(
      fixture('kit-public-2026-10-27.html'),
      KIT_ORIGIN + '/',
    );
    expect(page.links).toHaveLength(1);
    expect(page.links[0]!.id).toBe('kit:crs:2613907');
    expect(
      snapshotsToImport([page], new Date().toISOString()).courses.some(
        (c) => c.id === 'kit:crs:2613907',
      ),
    ).toBe(true);
  });
  it('extracts titles, stable IDs, course context, nested folders and explicitly labeled upload dates', () => {
    const page = extractPage(
      fixture('ilias-course-modern.html'),
      KIT_ORIGIN + '/goto.php/crs/100',
    );
    expect(page.course?.id).toBe('kit:crs:100');
    expect(page.links).toHaveLength(4);
    expect(page.links.find((l) => l.id === 'kit:file:201')).toMatchObject({
      title: 'Vorlesung 1',
      uploadedOn: '2026-10-24',
      url: KIT_ORIGIN + '/goto.php/file/201',
    });
    expect(
      page.links.find((l) => l.id === 'kit:file:202')!.uploadedOn,
    ).toBeNull();
  });
  it('supports legacy target/ref_id links, icon hints, missing dates and breadcrumbs', () => {
    const page = extractPage(
      fixture('ilias-folder-legacy.html'),
      KIT_ORIGIN + '/goto.php/fold/300',
    );
    expect(page.course?.id).toBe('kit:crs:100');
    expect(page.links.find((l) => l.id === 'kit:file:203')).toMatchObject({
      uploadedOn: '2026-10-23',
      url: KIT_ORIGIN + '/goto.php/file/203',
    });
    expect(
      page.links.find((l) => l.id === 'kit:file:204')!.uploadedOn,
    ).toBeNull();
    expect(page.links.filter((l) => l.id === 'kit:file:204')).toHaveLength(1);
  });
  it('merges nested snapshots into a single course and deduplicates materials', () => {
    const pages = [
      extractPage(
        fixture('ilias-course-modern.html'),
        KIT_ORIGIN + '/goto.php/crs/100',
      ),
      extractPage(
        fixture('ilias-folder-legacy.html'),
        KIT_ORIGIN + '/goto.php/fold/300',
      ),
    ];
    const result = snapshotsToImport(
      [...pages, ...pages],
      '2026-10-27T00:00:00.000Z',
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.items).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('PHPSESSID');
  });
  it('rejects foreign origins, script URLs, ambiguous ref_id and login pages', () => {
    expect(
      identifyLink('https://evil.test/goto.php/file/1', KIT_ORIGIN),
    ).toBeNull();
    expect(identifyLink('javascript:alert(1)', KIT_ORIGIN)).toBeNull();
    expect(identifyLink('/ilias.php?ref_id=1', KIT_ORIGIN)).toBeNull();
    expect(() =>
      extractPage(
        new DOMParser().parseFromString('<input type="password">', 'text/html'),
        KIT_ORIGIN,
      ),
    ).toThrow('Anmeldung');
  });
});
