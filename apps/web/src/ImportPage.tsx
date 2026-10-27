import { useRef, useState } from 'react';
import { Check, Download, FolderSync, Upload } from 'lucide-react';
import {
  createCourse,
  MAX_IMPORT_BYTES,
  mergeCourse,
  parseImport,
  syncResponseSchema,
  todayInBerlin,
  workspaceSchema,
  type ImportPayload,
  type Workspace,
} from '../../../packages/domain/src/index';
import { downloadJson } from './persistence';
import { RulesEditor } from './RulesEditor';
import {
  Modal,
  Field,
  errorText,
  type T,
  type Update,
  type Confirm,
} from './ui';
export function ImportPage({
  workspace,
  update,
  replace,
  t,
  confirm,
  onError,
}: {
  workspace: Workspace;
  update: Update;
  replace: Update;
  t: T;
  confirm: Confirm;
  onError: (v: string | null) => void;
}) {
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [backup, setBackup] = useState<Workspace | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [extensionId, setExtensionId] = useState(
    () => localStorage.getItem('bot:extension-id') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  function preview(value: ImportPayload) {
    setPayload(value);
    setMapping(
      Object.fromEntries(
        value.courses.map((c) => [
          c.id,
          workspace.courses.find((v) => v.sourceId === c.id)?.id ?? 'new',
        ]),
      ),
    );
  }
  async function readFile(input: File | undefined) {
    if (!input) return;
    try {
      if (input.size > MAX_IMPORT_BYTES) throw new Error('Maximal 5 MB');
      const text = await input.text();
      const raw: unknown = JSON.parse(text);
      const parsed = workspaceSchema.safeParse(raw);
      if (parsed.success) setBackup(parsed.data);
      else preview(parseImport(text));
      onError(null);
    } catch (e) {
      onError(`${t('fileError')} ${errorText(e)}`);
    }
  }
  async function requestSync() {
    setBusy(true);
    try {
      if (!/^[a-p]{32}$/.test(extensionId))
        throw new Error('Ungültige Chromium-Erweiterungs-ID');
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage)
        throw new Error(
          'Erweiterung nicht erreichbar. Website-Origin in der Erweiterung konfigurieren oder JSON-Import verwenden.',
        );
      localStorage.setItem('bot:extension-id', extensionId);
      const nonce = crypto.randomUUID();
      const response: unknown = await Promise.race([
        chrome.runtime.sendMessage(extensionId, {
          kind: 'back-on-track/request',
          version: 1,
          nonce,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error('Zeitüberschreitung. JSON-Import verwenden.')),
            10000,
          ),
        ),
      ]);
      const validated = syncResponseSchema.parse(response);
      if (validated.nonce !== nonce)
        throw new Error('Ungültige Antwort der Erweiterung');
      if (validated.kind === 'back-on-track/error')
        throw new Error(validated.error);
      preview(parseImport(JSON.stringify(validated.payload)));
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function approve() {
    if (!payload) return;
    const next = {
      ...workspace,
      courses: [...workspace.courses],
      history: [...workspace.history],
    };
    const now = new Date().toISOString();
    for (const source of payload.courses) {
      const target = mapping[source.id];
      let course =
        target === 'new'
          ? createCourse(source.title, todayInBerlin())
          : next.courses.find((c) => c.id === target);
      if (!course) continue;
      const merged = mergeCourse(
        course,
        source,
        workspace.preferences.rules,
        now,
      );
      course = merged.course;
      next.courses = next.courses.some((c) => c.id === course.id)
        ? next.courses.map((c) => (c.id === course.id ? course : c))
        : [...next.courses, course];
      next.history = [
        {
          id: crypto.randomUUID(),
          at: now,
          courseId: course.id,
          added: merged.added,
          updated: merged.updated,
          warnings: [...payload.diagnostics, ...merged.warnings].slice(0, 500),
        },
        ...next.history,
      ].slice(0, 100);
    }
    update(next);
    setPayload(null);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KIT ILIAS / JSON</div>
          <h1>{t('syncTitle')}</h1>
          <p>{t('syncText')}</p>
        </div>
      </div>
      <div className="import-layout">
        <section className="panel">
          <span className="feature-icon">
            <FolderSync size={29} />
          </span>
          <h2>KIT ILIAS</h2>
          <p>{t('importInstructions')}</p>
          <Field label={t('extensionId')}>
            <input
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value.trim())}
              placeholder="abcdefghijklmnopqrstuvwxyzabcdef"
              spellCheck={false}
            />
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void requestSync()}
          >
            <FolderSync size={16} />
            {busy ? t('waiting') : t('sync')}
          </button>
          <p className="subtle">{t('unknownRelevant')}</p>
        </section>
        <section className="panel">
          <span className="feature-icon neutral">
            <Download size={28} />
          </span>
          <h2>JSON {t('backup')}</h2>
          <p>{t('replaceBackup')}</p>
          <div className="button-column">
            <button
              className="secondary"
              onClick={() =>
                downloadJson(workspace, `back-on-track-${todayInBerlin()}.json`)
              }
            >
              <Download size={16} />
              {t('backup')}
            </button>
            <button className="secondary" onClick={() => file.current?.click()}>
              <Upload size={16} />
              {t('jsonImport')}
            </button>
          </div>
          <input
            ref={file}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </section>
      </div>
      <RulesEditor workspace={workspace} update={update} t={t} />
      <section className="panel">
        <h2>{t('history')}</h2>
        {!workspace.history.length ? (
          <p>{t('noHistory')}</p>
        ) : (
          workspace.history.map((h) => (
            <div className="history-row" key={h.id}>
              <div>
                <strong>
                  {workspace.courses.find((c) => c.id === h.courseId)?.name ??
                    t('deleted')}
                </strong>
                <small>
                  {new Date(h.at).toLocaleString()} · +{h.added} / ↻{h.updated}
                </small>
              </div>
              {h.warnings.length > 0 && (
                <details>
                  <summary>{h.warnings.length} Hinweise</summary>
                  <ul>
                    {h.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))
        )}
      </section>
      {payload && (
        <Modal title={t('importReview')} onClose={() => setPayload(null)}>
          <p>
            ILIAS:{' '}
            {new Date(payload.exportedAt).toLocaleString(
              workspace.preferences.locale,
            )}
          </p>
          <p className="alert warning">{t('unknownRelevant')}</p>
          {payload.courses.map((c) => (
            <div className="import-course" key={c.id}>
              <strong>{c.title}</strong>
              <small>
                {c.items.length} {t('materials')} · {c.id}
              </small>
              <Field label={t('targetCourse')}>
                <select
                  value={mapping[c.id] ?? 'new'}
                  onChange={(e) =>
                    setMapping({ ...mapping, [c.id]: e.target.value })
                  }
                >
                  <option value="new">{t('newImportedCourse')}</option>
                  {workspace.courses.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <details>
                <summary>{t('review')}</summary>
                <ul>
                  {c.items.map((i) => (
                    <li key={i.id}>
                      {i.title} · {i.uploadedOn ?? 'Upload-Datum unbekannt'}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          {payload.diagnostics.map((d, i) => (
            <p className="subtle" key={i}>
              {d}
            </p>
          ))}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setPayload(null)}>
              {t('cancel')}
            </button>
            <button className="primary" onClick={approve}>
              <Check size={16} />
              {t('confirmImport')}
            </button>
          </div>
        </Modal>
      )}
      {backup && (
        <Modal title={t('importReview')} onClose={() => setBackup(null)}>
          <p>
            {backup.courses.length} {t('courses')} ·{' '}
            {backup.courses.reduce((n, c) => n + c.items.length, 0)}{' '}
            {t('materials')}
          </p>
          <p className="alert warning">{t('replaceBackup')}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setBackup(null)}>
              {t('cancel')}
            </button>
            <button
              className="primary"
              onClick={() =>
                confirm(t('replaceBackup'), () => {
                  replace(backup);
                  setBackup(null);
                })
              }
            >
              {t('confirmReplace')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
