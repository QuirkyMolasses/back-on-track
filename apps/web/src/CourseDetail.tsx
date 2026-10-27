import { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Ellipsis,
  FolderSync,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  calculateProgress,
  courseSchema,
  workload,
  type Category,
  type Course,
  type LearningItem,
} from '../../../packages/domain/src/index';
import {
  Modal,
  Field,
  ProgressBars,
  ProgressLabel,
  formData,
  str,
  nullable,
  formatDate,
  type T,
  type Confirm,
} from './ui';
export function CourseDetail({
  course,
  update,
  today,
  t,
  locale,
  confirm,
  onBack,
  onDelete,
}: {
  course: Course;
  update: (c: Course) => void;
  today: string;
  t: T;
  locale: string;
  confirm: Confirm;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [modal, setModal] = useState<'category' | 'task' | 'settings' | null>(
    null,
  );
  const [editing, setEditing] = useState<LearningItem | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const p = calculateProgress(course, today);
  const categories = [...course.categories].sort((a, b) => a.order - b.order);
  const setItem = (item: LearningItem) =>
    update({
      ...course,
      items: course.items.map((i) => (i.id === item.id ? item : i)),
    });
  const setCategory = (category: Category) =>
    update({
      ...course,
      categories: course.categories.map((c) =>
        c.id === category.id ? category : c,
      ),
    });
  function move(id: string, offset: number) {
    const ordered = [...categories];
    const index = ordered.findIndex((c) => c.id === id);
    const other = ordered[index + offset];
    if (!other) return;
    [ordered[index], ordered[index + offset]] = [other, ordered[index]!];
    update({
      ...course,
      categories: ordered.map((c, i) => ({ ...c, order: i })),
    });
  }
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        {t('back')}
      </button>
      <div className="page-heading course-heading">
        <div>
          <div className="eyebrow">{t(course.mode)}</div>
          <h1>{course.name}</h1>
          <p>{course.description}</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={() => setModal('settings')}>
            <Settings size={16} />
            {t('settings')}
          </button>
          <button
            className="icon-button danger-text"
            onClick={onDelete}
            aria-label={t('delete')}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <div className="detail-summary">
        <section className="panel pace-panel">
          <span className="eyebrow">{t('progress')}</span>
          <ProgressLabel p={p} t={t} large />
          <ProgressBars progress={p} t={t} />
          {p.status === 'overdue' && (
            <p className="negative">{t('overdueHint')}</p>
          )}
          {p.status === 'scheduled' && <p>{t('beforeHint')}</p>}
          {p.warnings.length > 0 && (
            <div className="alert warning">{t('missingUploads')}</div>
          )}
        </section>
        <section className="panel plan-panel">
          <div className="section-heading">
            <h2>{t('plan')}</h2>
            <CalendarDays size={20} />
          </div>
          <div className="segmented" aria-label={t('plan')}>
            {(['exam', 'track'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={course.mode === mode}
                className={course.mode === mode ? 'selected' : ''}
                onClick={() => update({ ...course, mode })}
              >
                {t(mode)}
              </button>
            ))}
          </div>
          <dl className="calculation-inputs">
            <div>
              <dt>{t('startDate')}</dt>
              <dd>{formatDate(course.startDate, locale)}</dd>
            </div>
            <div>
              <dt>{t('deadline')}</dt>
              <dd>{formatDate(p.deadline, locale)}</dd>
            </div>
            <div>
              <dt>{t('duration')}</dt>
              <dd>
                {p.duration ?? '—'} {t('days')}
              </dd>
            </div>
            <div>
              <dt>{t('totalWeight')}</dt>
              <dd>
                {p.completedWeight.toLocaleString(locale, {
                  maximumFractionDigits: 2,
                })}{' '}
                /{' '}
                {p.totalWeight.toLocaleString(locale, {
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div>
              <dt>{course.mode === 'exam' ? t('buffer') : t('followUp')}</dt>
              <dd>
                {course.mode === 'exam'
                  ? course.bufferDays
                  : course.followUpDays}
              </dd>
            </div>
          </dl>
          <details>
            <summary>{t('inputs')}</summary>
            <p className="formula">
              {t('actual')} = Σ({t('weight')} × {t('progress')}) / Σ(
              {t('weight')})<br />
              {t('expected')} = clamp(({today} − {course.startDate}) /{' '}
              {p.duration ?? '?'}, 0, 1)
              <br />Δ {t('days')} = ({t('actual')} − {t('expected')}) ×{' '}
              {p.duration ?? '?'}
            </p>
            <small>{t('datePolicy')}</small>
          </details>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>{t('categories')}</h2>
          <button className="text-button" onClick={() => setModal('category')}>
            <Plus size={16} />
            {t('addCategory')}
          </button>
        </div>
        {categories.length ? (
          <div className="category-list">
            {categories.map((cat, index) => {
              const work = workload(
                course.items.filter((i) => i.categoryId === cat.id),
                [cat],
              );
              return (
                <div className="category-row" key={cat.id}>
                  <span className="category-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <input
                    className="category-name"
                    aria-label={`${t('category')} ${index + 1}`}
                    key={`${cat.id}:${cat.name}`}
                    defaultValue={cat.name}
                    maxLength={300}
                    onBlur={(e) => {
                      if (e.target.value.trim())
                        setCategory({ ...cat, name: e.target.value });
                      else e.target.value = cat.name;
                    }}
                  />
                  <label className="weight-field">
                    <span>{t('weight')}</span>
                    <input
                      aria-label={`${t('weight')} ${cat.name}`}
                      type="number"
                      min={0}
                      max={10000}
                      step="0.1"
                      value={cat.weight}
                      onChange={(e) => {
                        if (e.target.validity.valid)
                          setCategory({
                            ...cat,
                            weight: Number(e.target.value),
                          });
                      }}
                    />
                  </label>
                  <div className="category-progress">
                    <div className="bar-track">
                      <span style={{ width: `${(work.actual ?? 0) * 100}%` }} />
                    </div>
                    <small>
                      {work.actual === null
                        ? '—'
                        : `${Math.round(work.actual * 100)}%`}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`${t('moveUp')} ${cat.name}`}
                      onClick={() => move(cat.id, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === categories.length - 1}
                      aria-label={`${t('moveDown')} ${cat.name}`}
                      onClick={() => move(cat.id, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${t('delete')} ${cat.name}`}
                      onClick={() =>
                        confirm(t('categoryDelete'), () =>
                          update({
                            ...course,
                            categories: course.categories.filter(
                              (c) => c.id !== cat.id,
                            ),
                            items: course.items.filter(
                              (i) => i.categoryId !== cat.id,
                            ),
                          }),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted empty-line">{t('noCategories')}</p>
        )}
      </section>
      <section className="panel task-panel">
        <div className="section-heading">
          <h2>
            {t('tasks')} <span className="count">{course.items.length}</span>
          </h2>
          <button
            className="primary small"
            disabled={!categories.length}
            onClick={() => setModal('task')}
          >
            <Plus size={16} />
            {t('addTask')}
          </button>
        </div>
        <div className="task-toolbar">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filter')}
            aria-label={t('filter')}
          />
          <select
            aria-label={t('progress')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {(['all', 'todo', 'done'] as const).map((f) => (
              <option key={f} value={f}>
                {t(f)}
              </option>
            ))}
          </select>
        </div>
        {course.items
          .filter(
            (i) =>
              i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
              (filter === 'all' ||
                (filter === 'done' ? i.completion === 1 : i.completion < 1)),
          )
          .map((item) => (
            <div
              className={`task-row ${item.completion === 1 ? 'is-done' : ''} ${!item.relevant ? 'irrelevant' : ''}`}
              key={item.id}
            >
              <input
                className="task-checkbox"
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      item.completion > 0 && item.completion < 1;
                }}
                type="checkbox"
                checked={item.completion === 1}
                aria-label={`${t('done')}: ${item.title}`}
                onChange={(e) =>
                  setItem({ ...item, completion: e.target.checked ? 1 : 0 })
                }
              />
              <div className="task-title">
                <button
                  className="title-button"
                  onClick={() => setEditing(item)}
                >
                  {item.title}
                </button>
                <div>
                  <span>
                    {categories.find((c) => c.id === item.categoryId)?.name}
                  </span>
                  <span>·</span>
                  <span>{item.source ? 'ILIAS' : t('manual')}</span>
                  <span>·</span>
                  <span>{formatDate(item.uploadedOn, locale)}</span>
                  {!item.relevant && (
                    <span className="pill">{t('relevant')}: ✕</span>
                  )}
                </div>
              </div>
              <label className="percentage">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(item.completion * 100)}
                  aria-label={`${t('progress')}: ${item.title}`}
                  onChange={(e) => {
                    if (e.target.validity.valid)
                      setItem({
                        ...item,
                        completion: Number(e.target.value) / 100,
                      });
                  }}
                />
                <span>%</span>
              </label>
              <button
                className="icon-button"
                aria-label={`${t('edit')}: ${item.title}`}
                onClick={() => setEditing(item)}
              >
                <Ellipsis size={19} />
              </button>
            </div>
          ))}
        {course.items.length === 0 && (
          <p className="muted empty-line">{t('noTasks')}</p>
        )}
        <div className="sync-meta">
          <FolderSync size={14} />
          {t('lastSync')}:{' '}
          {course.lastSyncAt
            ? new Date(course.lastSyncAt).toLocaleString(locale)
            : t('never')}
        </div>
      </section>
      {modal === 'settings' && (
        <Modal title={t('settings')} onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              const d = formData(e);
              update(
                courseSchema.parse({
                  ...course,
                  name: str(d, 'name'),
                  description: str(d, 'description'),
                  startDate: str(d, 'start'),
                  examDate: nullable(d, 'exam'),
                  bufferDays: Number(d.get('buffer')),
                  followUpDays: Number(d.get('follow')),
                }),
              );
              setModal(null);
            }}
          >
            <Field label={t('name')}>
              <input
                name="name"
                required
                defaultValue={course.name}
                maxLength={300}
              />
            </Field>
            <Field label={t('description')}>
              <textarea
                name="description"
                defaultValue={course.description}
                maxLength={3000}
              />
            </Field>
            <div className="form-grid">
              <Field label={t('startDate')}>
                <input
                  name="start"
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                  required
                  defaultValue={course.startDate}
                />
              </Field>
              <Field label={t('examDate')}>
                <input
                  name="exam"
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                  defaultValue={course.examDate ?? ''}
                />
              </Field>
              <Field label={t('buffer')}>
                <input
                  name="buffer"
                  type="number"
                  required
                  min={0}
                  max={730}
                  defaultValue={course.bufferDays}
                />
              </Field>
              <Field label={t('followUp')}>
                <input
                  name="follow"
                  type="number"
                  required
                  min={0}
                  max={730}
                  defaultValue={course.followUpDays}
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button className="primary">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'category' && (
        <Modal title={t('addCategory')} onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              const d = formData(e);
              update({
                ...course,
                categories: [
                  ...course.categories,
                  {
                    id: crypto.randomUUID(),
                    name: str(d, 'name').trim(),
                    weight: Number(d.get('weight')),
                    order: categories.length,
                  },
                ],
              });
              setModal(null);
            }}
          >
            <Field label={t('category')}>
              <input name="name" required maxLength={300} autoFocus />
            </Field>
            <Field label={t('weight')}>
              <input
                name="weight"
                type="number"
                min={0}
                max={10000}
                step="0.1"
                defaultValue={1}
                required
              />
            </Field>
            <div className="modal-actions">
              <button className="primary">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
      {(modal === 'task' || editing) && (
        <Modal
          title={editing ? t('edit') : t('addTask')}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
        >
          <form
            onSubmit={(e) => {
              const d = formData(e);
              const values = {
                title: str(d, 'title').trim(),
                categoryId: str(d, 'category'),
                uploadedOn: nullable(d, 'upload'),
                relevant: d.has('relevant'),
              };
              const overrides = [...(editing?.overrides ?? [])];
              if (editing?.source)
                for (const key of [
                  'title',
                  'categoryId',
                  'uploadedOn',
                  'relevant',
                ] as const)
                  if (values[key] !== editing[key] && !overrides.includes(key))
                    overrides.push(key);
              const item: LearningItem = {
                id: editing?.id ?? crypto.randomUUID(),
                ...values,
                completion: editing?.completion ?? 0,
                weightOverride:
                  nullable(d, 'weight') === null
                    ? null
                    : Number(d.get('weight')),
                source: editing?.source ?? null,
                overrides,
              };
              if (editing) setItem(item);
              else update({ ...course, items: [...course.items, item] });
              setModal(null);
              setEditing(null);
            }}
          >
            <Field label={t('title')}>
              <input
                name="title"
                required
                maxLength={300}
                defaultValue={editing?.title}
                autoFocus
              />
            </Field>
            <div className="form-grid">
              <Field label={t('category')}>
                <select
                  name="category"
                  required
                  defaultValue={editing?.categoryId ?? categories[0]?.id}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('upload')}>
                <input
                  name="upload"
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                  defaultValue={editing?.uploadedOn ?? ''}
                />
              </Field>
            </div>
            <Field label={t('weightOverride')}>
              <input
                name="weight"
                type="number"
                min={0}
                max={10000}
                step="0.1"
                placeholder={t('inherit')}
                defaultValue={editing?.weightOverride ?? ''}
              />
            </Field>
            <label className="checkbox-label">
              <input
                name="relevant"
                type="checkbox"
                defaultChecked={editing?.relevant ?? true}
              />
              {t('relevant')}
            </label>
            {editing?.source && (
              <div className="source-info">
                <a
                  href={editing.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ILIAS {t('source')}
                  <ArrowUpRight size={14} />
                </a>
                <small>{editing.source.id}</small>
              </div>
            )}
            <div className="modal-actions">
              {editing && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => {
                    confirm(t('taskDelete'), () => setItemDeleted(editing));
                  }}
                >
                  <Trash2 size={15} />
                  {t('delete')}
                </button>
              )}
              <button className="primary">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
  function setItemDeleted(item: LearningItem) {
    update({ ...course, items: course.items.filter((i) => i.id !== item.id) });
    setEditing(null);
  }
}
