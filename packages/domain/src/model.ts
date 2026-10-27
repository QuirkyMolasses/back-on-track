import { z } from 'zod';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      Number(v.slice(0, 4)) >= 1900
    );
  }, 'Ungültiges Kalenderdatum');
const title = z.string().trim().min(1).max(300);
const id = z.string().uuid();
export const iliasUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((v) => {
    const u = new URL(v);
    return (
      u.origin === 'https://ilias.studium.kit.edu' &&
      !u.username &&
      !u.password &&
      ((/^\/(?:goto\.php\/[a-z]+\/\d+)?$/.test(u.pathname) && !u.search) ||
        (u.pathname === '/ilias.php' &&
          /^\?baseClass=ilrepositorygui&ref_id=\d+$/.test(u.search))) &&
      !u.hash
    );
  }, 'Nur bereinigte KIT-ILIAS-Links sind erlaubt');
export const categorySchema = z
  .object({
    id,
    name: title,
    weight: z.number().finite().min(0).max(10000),
    order: z.number().int().min(0),
  })
  .strict();
export const sourceSchema = z
  .object({
    id: z.string().min(1).max(200),
    url: iliasUrlSchema,
    title,
    category: title.nullable(),
    uploadedOn: dateSchema.nullable(),
  })
  .strict();
export const itemSchema = z
  .object({
    id,
    title,
    categoryId: id,
    completion: z.number().finite().min(0).max(1),
    weightOverride: z.number().finite().min(0).max(10000).nullable(),
    relevant: z.boolean(),
    uploadedOn: dateSchema.nullable(),
    source: sourceSchema.nullable(),
    overrides: z
      .array(z.enum(['title', 'categoryId', 'relevant', 'uploadedOn']))
      .max(4),
  })
  .strict();
export const courseSchema = z
  .object({
    id,
    name: title,
    description: z.string().max(3000),
    startDate: dateSchema,
    examDate: dateSchema.nullable(),
    bufferDays: z.number().int().min(0).max(730),
    followUpDays: z.number().int().min(0).max(730),
    mode: z.enum(['exam', 'track']),
    categories: z.array(categorySchema).max(100),
    items: z.array(itemSchema).max(10000),
    sourceId: z.string().max(200).nullable(),
    sourceUrl: iliasUrlSchema.nullable(),
    lastSyncAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const [key, values] of [
      ['categories', c.categories],
      ['items', c.items],
    ] as const) {
      if (new Set(values.map((v) => v.id)).size !== values.length)
        ctx.addIssue({ code: 'custom', message: 'Doppelte IDs', path: [key] });
    }
    const categories = new Set(c.categories.map((v) => v.id));
    if (c.items.some((i) => !categories.has(i.categoryId)))
      ctx.addIssue({
        code: 'custom',
        message: 'Unbekannte Kategorie',
        path: ['items'],
      });
    const sources = c.items.flatMap((i) => (i.source ? [i.source.id] : []));
    if (new Set(sources).size !== sources.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Doppelte Quell-ID',
        path: ['items'],
      });
  });
export const ruleSchema = z
  .object({
    contains: z.string().trim().min(1).max(100),
    category: title.nullable(),
    relevant: z.boolean(),
  })
  .strict();
export const preferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    locale: z.enum(['de', 'en']),
    rules: z.array(ruleSchema).max(100),
  })
  .strict();
export const historySchema = z
  .object({
    id,
    at: z.string().datetime(),
    courseId: id,
    added: z.number().int().min(0),
    updated: z.number().int().min(0),
    warnings: z.array(z.string().max(1000)).max(500),
  })
  .strict();
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    courses: z.array(courseSchema).max(500),
    preferences: preferencesSchema,
    history: z.array(historySchema).max(100),
  })
  .strict()
  .superRefine((w, ctx) => {
    const ids = w.courses.flatMap((c) => [
      c.id,
      ...c.categories.map((v) => v.id),
      ...c.items.map((v) => v.id),
    ]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'IDs müssen im Backup eindeutig sein',
      });
  });
export type Category = z.infer<typeof categorySchema>;
export type LearningItem = z.infer<typeof itemSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type ClassificationRule = z.infer<typeof ruleSchema>;
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  courses: [],
  preferences: { theme: 'system', locale: 'de', rules: [] },
  history: [],
});
export function createCourse(name: string, startDate: string): Course {
  return courseSchema.parse({
    id: crypto.randomUUID(),
    name,
    startDate,
    description: '',
    examDate: null,
    bufferDays: 7,
    followUpDays: 7,
    mode: 'exam',
    categories: [],
    items: [],
    sourceId: null,
    sourceUrl: null,
    lastSyncAt: null,
  });
}
