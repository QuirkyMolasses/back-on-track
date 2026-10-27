import { describe, expect, it } from 'vitest';
import {
  classify,
  emptyWorkspace,
  importSchema,
  iliasUrlSchema,
  mergeCourse,
  parseImport,
  syncRequestSchema,
  syncResponseSchema,
  workspaceSchema,
  type ImportedCourse,
} from '../packages/domain/src/index';
import { fixtureCourse } from './helpers';
const now = '2026-01-24T12:00:00.000Z';
const incoming: ImportedCourse = {
  id: 'kit:crs:10',
  title: 'Kurs',
  url: 'https://ilias.studium.kit.edu/goto.php/crs/10',
  items: [
    {
      id: 'kit:file:20',
      title: 'Übungsblatt 1',
      url: 'https://ilias.studium.kit.edu/goto.php/file/20',
      category: null,
      uploadedOn: '2026-01-24',
    },
  ],
};
describe('idempotent import and user ownership', () => {
  it.each([
    'not-a-url',
    'https://user:password@ilias.studium.kit.edu/goto.php/file/1',
  ])(
    'rejects malformed or credential-bearing source URLs without throwing: %s',
    (url) => {
      expect(iliasUrlSchema.safeParse(url).success).toBe(false);
    },
  );
  it('shares strict versioned request and response validation across extension and website', () => {
    const nonce = crypto.randomUUID();
    expect(
      syncRequestSchema.safeParse({
        kind: 'back-on-track/request',
        version: 1,
        nonce,
      }).success,
    ).toBe(true);
    expect(
      syncRequestSchema.safeParse({
        kind: 'back-on-track/request',
        version: 1,
        nonce,
        cookie: 'secret',
      }).success,
    ).toBe(false);
    expect(
      syncResponseSchema.safeParse({
        kind: 'back-on-track/error',
        version: 1,
        nonce,
        error: 'No data yet',
      }).success,
    ).toBe(true);
    expect(
      syncRequestSchema.safeParse({
        kind: 'back-on-track/request',
        version: 1,
        nonce: 'invalid',
      }).success,
    ).toBe(false);
  });
  it('does not erase a known date when a later scan has no date metadata', () => {
    const c = mergeCourse(fixtureCourse(), incoming, [], now).course;
    const next = {
      ...incoming,
      items: incoming.items.map((i) => ({ ...i, uploadedOn: null })),
    };
    expect(mergeCourse(c, next, [], now).course.items[1]!.uploadedOn).toBe(
      '2026-01-24',
    );
  });
  it('retains renamed categories and their weights on subsequent imports', () => {
    const c = mergeCourse(fixtureCourse(), incoming, [], now).course;
    const category = c.categories.at(-1)!;
    category.name = 'Mein eigener Name';
    category.weight = 9;
    const result = mergeCourse(c, incoming, [], now).course;
    expect(result.categories).toHaveLength(c.categories.length);
    expect(result.items[1]!.categoryId).toBe(category.id);
    expect(result.categories.at(-1)!).toMatchObject({
      name: 'Mein eigener Name',
      weight: 9,
    });
  });
  it('deduplicates repeated imports', () => {
    const first = mergeCourse(fixtureCourse(), incoming, [], now);
    const second = mergeCourse(first.course, incoming, [], now);
    expect(second.added).toBe(0);
    expect(second.course.items).toHaveLength(2);
    expect(second.course.categories).toHaveLength(2);
  });
  it('preserves completion, manual edits, category weights and individual weights', () => {
    const c = mergeCourse(fixtureCourse(), incoming, [], now).course;
    const item = c.items[1]!;
    item.title = 'Mein Titel';
    item.completion = 0.75;
    item.weightOverride = 5;
    item.relevant = true;
    item.uploadedOn = '2026-01-10';
    item.categoryId = c.categories[0]!.id;
    item.overrides = ['title', 'uploadedOn', 'relevant', 'categoryId'];
    c.categories[0]!.weight = 8;
    const result = mergeCourse(
      c,
      {
        ...incoming,
        items: [{ ...incoming.items[0]!, title: 'Neuer Quelltitel' }],
      },
      [],
      now,
    );
    expect(result.course.items[1]).toMatchObject({
      title: 'Mein Titel',
      completion: 0.75,
      weightOverride: 5,
      relevant: true,
      uploadedOn: '2026-01-10',
      categoryId: c.categories[0]!.id,
    });
    expect(result.course.items[1]!.source!.title).toBe('Neuer Quelltitel');
    expect(result.course.categories[0]!.weight).toBe(8);
    expect(c.items[1]!.source!.title).toBe('Übungsblatt 1');
  });
  it('never removes unpublished/missing items or manual items', () => {
    const c = mergeCourse(fixtureCourse(), incoming, [], now).course;
    expect(
      mergeCourse(c, { ...incoming, items: [] }, [], now).course.items,
    ).toEqual(c.items);
  });
  it('defaults unknown materials to irrelevant and applies first matching configurable rule', () => {
    expect(classify('Übungsblatt 1', []).relevant).toBe(false);
    const result = mergeCourse(
      fixtureCourse(),
      incoming,
      [
        { contains: 'Übung', category: 'Üben', relevant: true },
        { contains: 'blatt', category: null, relevant: false },
      ],
      now,
    );
    expect(result.course.items[1]!.relevant).toBe(true);
    expect(result.course.categories.at(-1)!.name).toBe('Üben');
  });
  it('skips duplicate source IDs within a payload', () => {
    const result = mergeCourse(
      fixtureCourse(),
      { ...incoming, items: [...incoming.items, ...incoming.items] },
      [],
      now,
    );
    expect(result.added).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });
  it('strictly validates version, unknown keys, origins, secret query parameters and size', () => {
    const payload = {
      kind: 'back-on-track/ilias',
      version: 1,
      exportedAt: now,
      courses: [incoming],
      diagnostics: [],
    };
    expect(importSchema.safeParse(payload).success).toBe(true);
    expect(importSchema.safeParse({ ...payload, version: 2 }).success).toBe(
      false,
    );
    expect(
      importSchema.safeParse({ ...payload, cookie: 'secret' }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        ...payload,
        courses: [{ ...incoming, url: 'https://evil.test/' }],
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        ...payload,
        courses: [{ ...incoming, url: incoming.url + '?token=secret' }],
      }).success,
    ).toBe(false);
    expect(() => parseImport(' '.repeat(5_000_001))).toThrow('5 MB');
  });
  it('rejects invalid references, duplicate IDs and out-of-range progress in backups', () => {
    const c = fixtureCourse();
    expect(
      workspaceSchema.safeParse({ ...emptyWorkspace(), courses: [c, c] })
        .success,
    ).toBe(false);
    c.items[0]!.categoryId = crypto.randomUUID();
    expect(
      workspaceSchema.safeParse({ ...emptyWorkspace(), courses: [c] }).success,
    ).toBe(false);
  });
});
