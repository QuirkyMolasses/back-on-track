import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const origin = process.env.BOT_APP_ORIGIN || 'http://localhost:5173';
const url = new URL(origin);
if (
  url.origin !== origin ||
  (url.protocol !== 'https:' && origin !== 'http://localhost:5173')
)
  throw new Error(
    'BOT_APP_ORIGIN must be an exact HTTPS origin or http://localhost:5173',
  );
const dir = 'apps/extension/dist';
await mkdir(dir, { recursive: true });
await build({
  entryPoints: [
    'apps/extension/src/popup.ts',
    'apps/extension/src/background.ts',
    'apps/extension/src/content.ts',
  ],
  outdir: dir,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  define: { __APP_ORIGIN__: JSON.stringify(origin) },
  minify: true,
});
for (const file of ['popup.html', 'popup.css'])
  await copyFile(`apps/extension/${file}`, `${dir}/${file}`);
await writeFile(
  `${dir}/manifest.json`,
  JSON.stringify(
    {
      manifest_version: 3,
      name: 'Back on Track · KIT ILIAS',
      version: '1.0.0',
      description:
        'Importiere Lernmaterial aus deiner angemeldeten KIT-ILIAS-Sitzung.',
      permissions: ['activeTab', 'scripting', 'storage'],
      action: { default_popup: 'popup.html' },
      background: { service_worker: 'background.js' },
      externally_connectable: {
        matches: [`${url.protocol}//${url.hostname}/*`],
      },
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    },
    null,
    2,
  ),
);
console.log(
  `Extension built in ${dir}; only ${origin} may request reviewed imports.`,
);
