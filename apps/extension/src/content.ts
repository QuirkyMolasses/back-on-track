import {
  extractPage,
  KIT_ORIGIN,
  type PageSnapshot,
} from '../../../packages/ilias/src/index';
declare global {
  interface Window {
    __backOnTrackExtract?: (nested: boolean) => Promise<PageSnapshot[]>;
  }
}
window.__backOnTrackExtract = async (nested) => {
  const first = extractPage(document, location.href);
  const pages = [first];
  if (!nested) return pages;
  const visited = new Set([first.url]);
  const queue = first.links
    .filter((l) => ['fold', 'crs'].includes(l.type))
    .map((l) => ({
      url: l.url,
      depth: 1,
      course: l.type === 'crs' ? l : first.course,
    }));
  while (queue.length && pages.length < 50) {
    const next = queue.shift()!;
    if (visited.has(next.url) || next.depth > 5) continue;
    visited.add(next.url);
    if (new URL(next.url).origin !== KIT_ORIGIN) continue;
    try {
      const response = await fetch(next.url, {
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('text/html')
      )
        throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length > 5_000_000) throw new Error('Seite zu groß');
      const page = extractPage(
        new DOMParser().parseFromString(html, 'text/html'),
        next.url,
      );
      page.course ??= next.course;
      pages.push(page);
      for (const link of page.links.filter((l) => l.type === 'fold'))
        queue.push({
          url: link.url,
          depth: next.depth + 1,
          course: page.course,
        });
    } catch {
      first.warnings.push(
        `Seite nicht gelesen (Anmeldung, Zugriff oder Netzwerk): ${next.url}`,
      );
    }
  }
  if (queue.length)
    first.warnings.push(
      'Grenze von 50 Seiten / 5 Ordnerebenen erreicht. Weitere Ordner einzeln importieren.',
    );
  return pages;
};
