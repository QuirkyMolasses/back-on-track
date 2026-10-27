import type { Category, Course, LearningItem } from './model';
import { addDays, dayNumber } from './dates';
export type ProgressStatus =
  | 'empty'
  | 'missing-deadline'
  | 'invalid-interval'
  | 'scheduled'
  | 'active'
  | 'overdue'
  | 'completed';
export interface Progress {
  status: ProgressStatus;
  actual: number | null;
  expected: number | null;
  daysDelta: number | null;
  overdueDays: number;
  duration: number | null;
  deadline: string | null;
  totalWeight: number;
  completedWeight: number;
  count: number;
  warnings: string[];
}
export function workload(items: LearningItem[], categories: Category[]) {
  const weights = new Map(categories.map((c) => [c.id, c.weight]));
  let totalWeight = 0,
    completedWeight = 0,
    count = 0;
  for (const item of items) {
    if (!item.relevant) continue;
    const weight = item.weightOverride ?? weights.get(item.categoryId) ?? 0;
    totalWeight += weight;
    completedWeight += weight * item.completion;
    if (weight > 0) count++;
  }
  return {
    totalWeight,
    completedWeight,
    count,
    actual: totalWeight > 0 ? completedWeight / totalWeight : null,
  };
}
export function calculateProgress(course: Course, today: string): Progress {
  const current = dayNumber(today);
  const work = workload(course.items, course.categories);
  const relevant = course.items.filter((i) => i.relevant);
  const uploads = relevant
    .flatMap((i) => (i.uploadedOn ? [i.uploadedOn] : []))
    .sort();
  const latest = uploads.at(-1);
  let deadline: string | null = null;
  let invalidDeadline = false;
  try {
    deadline =
      course.mode === 'exam'
        ? course.examDate
          ? addDays(course.examDate, -course.bufferDays)
          : null
        : latest
          ? addDays(latest, course.followUpDays)
          : null;
  } catch {
    // A valid input at the supported calendar boundary may overflow after an offset.
    invalidDeadline = true;
  }
  const warnings: string[] = [];
  if (course.mode === 'track' && relevant.some((i) => !i.uploadedOn))
    warnings.push('missing-upload-dates');
  const result: Progress = {
    ...work,
    status: 'empty',
    expected: null,
    daysDelta: null,
    overdueDays: 0,
    duration: null,
    deadline,
    warnings,
  };
  if (work.actual === null) return result;
  if (invalidDeadline) return { ...result, status: 'invalid-interval' };
  if (!deadline) return { ...result, status: 'missing-deadline' };
  const start = dayNumber(course.startDate),
    end = dayNumber(deadline),
    duration = end - start;
  if (duration <= 0) return { ...result, status: 'invalid-interval', duration };
  const expected = Math.min(1, Math.max(0, (current - start) / duration));
  const overdueDays = Math.max(0, current - end);
  const status =
    work.actual >= 1
      ? 'completed'
      : current > end
        ? 'overdue'
        : current < start
          ? 'scheduled'
          : 'active';
  return {
    ...result,
    status,
    expected,
    duration,
    overdueDays,
    daysDelta:
      current >= start && current <= end
        ? (work.actual - expected) * duration
        : null,
  };
}
