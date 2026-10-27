import { describe, expect, it } from 'vitest';
import {
  addDays,
  calculateProgress,
  dateSchema,
  dayNumber,
  todayInBerlin,
  workload,
} from '../packages/domain/src/index';
import { fixtureCourse, fixtureItem } from './helpers';
describe('linear weighted course planning', () => {
  it('matches the 30-day numerical example: 60% at day 15 = +3 days', () => {
    const p = calculateProgress(fixtureCourse(), '2026-01-16');
    expect(p.duration).toBe(30);
    expect(p.actual).toBe(0.6);
    expect(p.expected).toBe(0.5);
    expect(p.daysDelta).toBeCloseTo(3);
  });
  it('uses category weights, partial completion and item overrides', () => {
    const c = fixtureCourse();
    const cat = {
      id: crypto.randomUUID(),
      name: 'Seminar',
      weight: 3,
      order: 1,
    };
    c.categories.push(cat);
    c.items = [
      fixtureItem(c.categories[0]!.id, { completion: 0.5 }),
      fixtureItem(cat.id, { completion: 1 }),
      fixtureItem(cat.id, { completion: 0.25, weightOverride: 2 }),
    ];
    expect(workload(c.items, c.categories).actual).toBeCloseTo(4 / 6);
  });
  it('ignores irrelevant materials and zero-weight work', () => {
    const c = fixtureCourse();
    c.items.push(
      fixtureItem(c.categories[0]!.id, { relevant: false, completion: 0 }),
      fixtureItem(c.categories[0]!.id, { weightOverride: 0, completion: 0 }),
    );
    expect(calculateProgress(c, '2026-01-16').actual).toBe(0.6);
  });
  it.each([
    { items: [] },
    { items: [fixtureItem(crypto.randomUUID(), { weightOverride: 0 })] },
  ])(
    'does not invent completion for empty/zero-weight courses',
    ({ items }) => {
      const p = calculateProgress(fixtureCourse({ items }), '2026-01-16');
      expect(p.status).toBe('empty');
      expect(p.actual).toBeNull();
      expect(p.daysDelta).toBeNull();
    },
  );
  it('does not invent a missing exam date', () => {
    expect(
      calculateProgress(fixtureCourse({ examDate: null }), '2026-01-16').status,
    ).toBe('missing-deadline');
  });
  it('has one track deadline based on latest relevant upload, with configurable offset', () => {
    const c = fixtureCourse({ mode: 'track' });
    expect(calculateProgress(c, '2026-01-16').deadline).toBe('2026-01-31');
    c.items.push(
      fixtureItem(c.categories[0]!.id, {
        uploadedOn: '2026-02-01',
        completion: 0,
      }),
    );
    const p = calculateProgress(c, '2026-01-16');
    expect(p.deadline).toBe('2026-02-08');
    expect(p.actual).toBe(0.3);
    expect(p.duration).toBe(38);
    c.followUpDays = 14;
    expect(calculateProgress(c, '2026-01-16').deadline).toBe('2026-02-15');
  });
  it('administrative uploads never shift the deadline', () => {
    const c = fixtureCourse({ mode: 'track' });
    c.items.push(
      fixtureItem(c.categories[0]!.id, {
        uploadedOn: '2026-12-31',
        relevant: false,
      }),
    );
    expect(calculateProgress(c, '2026-01-16').deadline).toBe('2026-01-31');
  });
  it('missing uploads remain unknown and partially known deadlines are warned', () => {
    const c = fixtureCourse({ mode: 'track' });
    c.items[0]!.uploadedOn = null;
    expect(calculateProgress(c, '2026-01-16').status).toBe('missing-deadline');
    c.items.push(fixtureItem(c.categories[0]!.id));
    expect(calculateProgress(c, '2026-01-16').warnings).toContain(
      'missing-upload-dates',
    );
  });
  it.each(['2026-01-31', '2026-02-01'])(
    'rejects non-positive intervals starting %s',
    (startDate) => {
      expect(
        calculateProgress(fixtureCourse({ startDate }), '2026-01-16').status,
      ).toBe('invalid-interval');
    },
  );
  it('clamps before start and withholds day delta', () => {
    const p = calculateProgress(fixtureCourse(), '2025-12-31');
    expect(p.expected).toBe(0);
    expect(p.status).toBe('scheduled');
    expect(p.daysDelta).toBeNull();
  });
  it('keeps actual deadline and exposes overdue days after expiry', () => {
    const p = calculateProgress(fixtureCourse(), '2026-02-03');
    expect(p.expected).toBe(1);
    expect(p.deadline).toBe('2026-01-31');
    expect(p.status).toBe('overdue');
    expect(p.overdueDays).toBe(3);
    expect(p.daysDelta).toBeNull();
  });
  it('counts the deadline date itself as the final planning day', () => {
    const p = calculateProgress(fixtureCourse(), '2026-01-31');
    expect(p.status).toBe('active');
    expect(p.daysDelta).toBeCloseTo(-12);
  });
  it('recognizes completion even after deadline', () => {
    const c = fixtureCourse();
    c.items[0]!.completion = 1;
    expect(calculateProgress(c, '2026-02-10').status).toBe('completed');
  });
  it('changing weights and modes recalculates from current known work', () => {
    const c = fixtureCourse();
    c.items.push(
      fixtureItem(c.categories[0]!.id, { completion: 0, weightOverride: 3 }),
    );
    expect(calculateProgress(c, '2026-01-16').actual).toBe(0.15);
    c.mode = 'track';
    c.followUpDays = 14;
    expect(calculateProgress(c, '2026-01-16').deadline).toBe('2026-02-07');
  });
});
describe('Europe/Berlin calendar dates', () => {
  it.each([
    ['2026-03-28', '2026-03-30'],
    ['2026-10-24', '2026-10-26'],
  ])('does not change duration across DST: %s', (a, b) =>
    expect(dayNumber(b) - dayNumber(a)).toBe(2),
  );
  it('converts actual instants with the explicit timezone', () => {
    expect(todayInBerlin(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(todayInBerlin(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
  });
  it('validates leap days and rejects normalized invalid dates', () => {
    expect(dateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(dateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(dateSchema.safeParse('2026-13-01').success).toBe(false);
  });
});
