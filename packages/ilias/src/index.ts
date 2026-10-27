import {
  dateSchema,
  importSchema,
  type ImportPayload,
} from '../../domain/src/index';
export const KIT_ORIGIN = 'https://ilias.studium.kit.edu';
export interface IliasLink {
  id: string;
  type: string;
  title: string;
  url: string;
  uploadedOn: string | null;
}
export interface PageSnapshot {
  url: string;
  title: string;
  course: IliasLink | null;
  category: string | null;
  links: IliasLink[];
  warnings: string[];
}
/** All selectors live in one adapter. Modern/legacy ILIAS layouts are tested separately. */
export const ADAPTER = {
  links: 'a[href]',
  row: '.ilContainerListItem, .il_ContainerListItem, .il-item, tr, article',
  breadcrumbs: '.breadcrumb a[href], nav[aria-label="Breadcrumb"] a[href]',
  heading: 'h1, .il_HeaderTitle',
  types: ['crs', 'fold', 'file', 'exc', 'lm', 'sahs', 'htlm', 'tst'],
};
export function identifyLink(
  raw: string,
  base: string,
  typeHint?: string,
): { id: string; type: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.origin !== KIT_ORIGIN || u.username || u.password) return null;
  const path =
    u.pathname.match(/(?:goto\.php\/|\/goto\/)([a-z]+)\/(\d+)\/?$/i) ??
    u.pathname.match(/goto(?:_[a-z]+)?_([a-z]+)_(\d+)\.html$/i);
  const target = u.searchParams.get('target')?.match(/^([a-z]+)_(\d+)$/i);
  const type = (path?.[1] ?? target?.[1] ?? typeHint)?.toLowerCase();
  const ref = path?.[2] ?? target?.[2] ?? u.searchParams.get('ref_id');
  if (!type || !ref || !/^\d+$/.test(ref) || !ADAPTER.types.includes(type))
    return null;
  return {
    id: `kit:${type}:${ref}`,
    type,
    url: `${KIT_ORIGIN}/goto.php/${type}/${ref}`,
  };
}
function uploadDate(row: Element | null): string | null {
  if (!row) return null;
  // A generic "modified" or unlabeled date is deliberately never an upload date.
  const text = row.textContent ?? '';
  const match = text.match(
    /(?:Hochgeladen|Upload(?:ed)?(?:\s+on)?)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/i,
  );
  if (!match?.[1]) return null;
  const parts = match[1].split('.');
  const date =
    parts.length === 3
      ? `${parts[2]}-${parts[1]!.padStart(2, '0')}-${parts[0]!.padStart(2, '0')}`
      : match[1];
  const parsed = dateSchema.safeParse(date);
  return parsed.success ? parsed.data : null;
}
export function extractPage(doc: Document, pageUrl: string): PageSnapshot {
  if (new URL(pageUrl).origin !== KIT_ORIGIN)
    throw new Error('Nicht unterstützte Domain');
  if (
    doc.querySelector('input[type="password"]') ||
    /\/login|shib_login/i.test(new URL(pageUrl).pathname)
  )
    throw new Error('ILIAS-Anmeldung erforderlich');
  const links = new Map<string, IliasLink>();
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>(ADAPTER.links)) {
    if (anchor.closest('header, footer, .il-maincontrols')) continue;
    const row = anchor.closest(ADAPTER.row);
    const icon = row
      ?.querySelector('img[src*="icon_"]')
      ?.getAttribute('src')
      ?.match(/icon_([a-z]+)[_.]/i)?.[1];
    const identity = identifyLink(
      anchor.getAttribute('href') ?? '',
      pageUrl,
      icon,
    );
    const title = anchor.textContent?.trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!identity || !title || links.has(identity.id)) continue;
    links.set(identity.id, { ...identity, title, uploadedOn: uploadDate(row) });
  }
  const title =
    doc.querySelector(ADAPTER.heading)?.textContent?.trim().slice(0, 300) ||
    doc.title.slice(0, 300) ||
    'ILIAS-Seite';
  const breadcrumbs = [
    ...doc.querySelectorAll<HTMLAnchorElement>(ADAPTER.breadcrumbs),
  ]
    .map((a) => {
      const v = identifyLink(a.getAttribute('href') ?? '', pageUrl);
      return v?.type === 'crs'
        ? {
            ...v,
            title: a.textContent?.trim().slice(0, 300) || 'ILIAS-Kurs',
            uploadedOn: null,
          }
        : null;
    })
    .filter((v) => v !== null);
  const current = identifyLink(pageUrl, pageUrl);
  const course =
    current?.type === 'crs'
      ? { ...current, title, uploadedOn: null }
      : (breadcrumbs.at(-1) ?? null);
  const ref = new URL(pageUrl).searchParams.get('ref_id');
  const fallbackUrl =
    ref && /^\d+$/.test(ref)
      ? `${KIT_ORIGIN}/ilias.php?baseClass=ilrepositorygui&ref_id=${ref}`
      : KIT_ORIGIN + '/';
  return {
    url: current?.url ?? fallbackUrl,
    title,
    course,
    category: current?.type === 'fold' ? title : null,
    links: [...links.values()],
    warnings: [
      'Automatische Erkennung prüfen. Unbekannte Upload-Daten bleiben leer.',
    ],
  };
}
export function snapshotsToImport(
  pages: PageSnapshot[],
  now: string,
): ImportPayload {
  const courses = new Map<string, ImportPayload['courses'][number]>();
  const diagnostics: string[] = [];
  for (const page of pages) {
    diagnostics.push(...page.warnings);
    for (const discovered of page.links.filter((l) => l.type === 'crs')) {
      if (!courses.has(discovered.id))
        courses.set(discovered.id, {
          id: discovered.id,
          title: discovered.title,
          url: discovered.url,
          items: [],
        });
    }
    const context = page.course ?? {
      id: `page:${page.url}`,
      title: page.title,
      url: page.url,
    };
    if (!courses.has(context.id))
      courses.set(context.id, { ...context, items: [] });
    const course = courses.get(context.id)!;
    for (const link of page.links.filter(
      (l) => !['fold', 'crs'].includes(l.type),
    )) {
      if (!course.items.some((i) => i.id === link.id))
        course.items.push({
          id: link.id,
          title: link.title,
          url: link.url,
          uploadedOn: link.uploadedOn,
          category: page.category,
        });
    }
  }
  return importSchema.parse({
    kind: 'back-on-track/ilias',
    version: 1,
    exportedAt: now,
    courses: [...courses.values()],
    diagnostics: [...new Set(diagnostics)].slice(0, 500),
  });
}
