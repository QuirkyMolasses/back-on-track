import { z } from 'zod';
import {
  dateSchema,
  iliasUrlSchema,
  type ClassificationRule,
  type Course,
  type LearningItem,
} from './model';
export const PROTOCOL_VERSION = 1;
export const MAX_IMPORT_BYTES = 5_000_000;
export const importedCourseSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    url: iliasUrlSchema,
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            title: z.string().trim().min(1).max(300),
            url: iliasUrlSchema,
            category: z.string().trim().min(1).max(300).nullable(),
            uploadedOn: dateSchema.nullable(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export const importSchema = z
  .object({
    kind: z.literal('back-on-track/ilias'),
    version: z.literal(PROTOCOL_VERSION),
    exportedAt: z.string().datetime(),
    courses: z.array(importedCourseSchema).min(1).max(500),
    diagnostics: z.array(z.string().max(1000)).max(500),
  })
  .strict()
  .refine(
    (payload) =>
      new Set(payload.courses.map((c) => c.id)).size === payload.courses.length,
    'Doppelte Kurs-Quell-IDs',
  );
export type ImportPayload = z.infer<typeof importSchema>;
export type ImportedCourse = z.infer<typeof importedCourseSchema>;
export const syncRequestSchema = z
  .object({
    kind: z.literal('back-on-track/request'),
    version: z.literal(PROTOCOL_VERSION),
    nonce: z.string().uuid(),
  })
  .strict();
export const syncResponseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('back-on-track/response'),
      version: z.literal(PROTOCOL_VERSION),
      nonce: z.string().uuid(),
      payload: importSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('back-on-track/error'),
      version: z.literal(PROTOCOL_VERSION),
      nonce: z.string().uuid(),
      error: z.string().max(1000),
    })
    .strict(),
]);
export function parseImport(text: string): ImportPayload {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error('Import exceeds 5 MB');
  return importSchema.parse(JSON.parse(text));
}
export function classify(title: string, rules: ClassificationRule[]) {
  const rule = rules.find((r) =>
    title.toLocaleLowerCase('de').includes(r.contains.toLocaleLowerCase('de')),
  );
  return rule
    ? { relevant: rule.relevant, category: rule.category }
    : { relevant: false, category: null };
}
/** Import never removes items. Completion, custom weight and explicit user overrides are retained. */
export function mergeCourse(
  course: Course,
  incoming: ImportedCourse,
  rules: ClassificationRule[],
  now: string,
) {
  const categories = course.categories.map((c) => ({ ...c }));
  const items = course.items.map((i) => ({ ...i }));
  const warnings: string[] = [];
  let added = 0,
    updated = 0;
  const seen = new Set<string>();
  for (const data of incoming.items) {
    if (seen.has(data.id)) {
      warnings.push(`Doppelte Quell-ID übersprungen: ${data.id}`);
      continue;
    }
    seen.add(data.id);
    const classification = classify(data.title, rules);
    const categoryName =
      classification.category ?? data.category ?? 'Importiert';
    const existing = items.find((i) => i.source?.id === data.id);
    let categoryId = existing?.categoryId;
    // Existing category assignments belong to the user, including renamed categories.
    if (!existing) {
      let category = categories.find(
        (c) =>
          c.name.toLocaleLowerCase('de') ===
          categoryName.toLocaleLowerCase('de'),
      );
      if (!category) {
        category = {
          id: crypto.randomUUID(),
          name: categoryName,
          weight: 1,
          order: categories.length,
        };
        categories.push(category);
      }
      categoryId = category.id;
    }
    const source = {
      id: data.id,
      title: data.title,
      url: data.url,
      category: data.category,
      uploadedOn: data.uploadedOn,
    };
    if (existing) {
      existing.source = source;
      if (!existing.overrides.includes('title')) existing.title = data.title;
      if (!existing.overrides.includes('categoryId'))
        existing.categoryId = categoryId!;
      if (
        !existing.overrides.includes('uploadedOn') &&
        data.uploadedOn !== null
      )
        existing.uploadedOn = data.uploadedOn;
      if (!existing.overrides.includes('relevant'))
        existing.relevant = classification.relevant;
      updated++;
    } else {
      items.push({
        id: crypto.randomUUID(),
        title: data.title,
        categoryId: categoryId!,
        completion: 0,
        weightOverride: null,
        relevant: classification.relevant,
        uploadedOn: data.uploadedOn,
        source,
        overrides: [],
      } satisfies LearningItem);
      added++;
    }
    if (!data.uploadedOn)
      warnings.push(`Upload-Datum unbekannt: ${data.title}`);
  }
  return {
    course: {
      ...course,
      categories,
      items,
      sourceId: incoming.id,
      sourceUrl: incoming.url,
      lastSyncAt: now,
    },
    added,
    updated,
    warnings,
  };
}
