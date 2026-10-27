import {
  createCourse,
  type Course,
  type LearningItem,
} from '../packages/domain/src/index';
export function fixtureCourse(overrides: Partial<Course> = {}): Course {
  const c = createCourse('Testkurs', '2026-01-01');
  const category = {
    id: crypto.randomUUID(),
    name: 'Eigene Aktivität',
    weight: 1,
    order: 0,
  };
  return {
    ...c,
    examDate: '2026-02-07',
    bufferDays: 7,
    categories: [category],
    items: [fixtureItem(category.id)],
    ...overrides,
  };
}
export function fixtureItem(
  categoryId: string,
  overrides: Partial<LearningItem> = {},
): LearningItem {
  return {
    id: crypto.randomUUID(),
    title: 'Material',
    categoryId,
    completion: 0.6,
    weightOverride: null,
    relevant: true,
    uploadedOn: '2026-01-24',
    source: null,
    overrides: [],
    ...overrides,
  };
}
