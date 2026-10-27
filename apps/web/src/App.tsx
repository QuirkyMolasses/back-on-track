import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  Download,
  FileText,
  Flag,
  FolderSync,
  LayoutDashboard,
  Leaf,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import {
  calculateProgress,
  createCourse,
  todayInBerlin,
  workspaceSchema,
  type Course,
  type Workspace,
} from '../../../packages/domain/src/index';
import {
  cloud,
  loadCloud,
  loadLocal,
  saveCloud,
  saveLocal,
} from './persistence';
import { translator } from './i18n';
import { CourseDetail } from './CourseDetail';
import { ImportPage } from './ImportPage';
import { RulesEditor } from './RulesEditor';
import {
  Modal,
  Field,
  ProgressBars,
  ProgressLabel,
  Stat,
  colors,
  errorText,
  formatDate,
  formData,
  str,
  nullable,
  type Update,
  type Confirm,
} from './ui';
export function App() {
  const [user, setUser] = useState<User | null | undefined>(
    cloud ? undefined : null,
  );
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    void cloud.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      setUser(data.session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (user === undefined)
    return <main className="fatal">Back on Track · Lädt …</main>;
  return (
    <WorkspaceApp key={user?.id ?? 'local'} user={user} authError={authError} />
  );
}
function WorkspaceApp({
  user,
  authError,
}: {
  user: User | null;
  authError: string | null;
}) {
  const storageKey = `back-on-track:v1:${user?.id ?? 'local'}`;
  const [initial] = useState(() => loadLocal(storageKey));
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [error, setError] = useState<string | null>(initial.error ?? authError);
  const [blocked, setBlocked] = useState(Boolean(initial.error));
  const [page, setPage] = useState<'overview' | 'imports' | 'settings'>(
    'overview',
  );
  const [selected, setSelected] = useState<string | null>(
    location.hash.startsWith('#course/') ? location.hash.slice(8) : null,
  );
  const [newCourse, setNewCourse] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    action: () => void;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const t = translator(workspace.preferences.locale);
  const isDark =
    workspace.preferences.theme === 'dark' ||
    (workspace.preferences.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const confirm: Confirm = (text, action) => setConfirmation({ text, action });
  const update: Update = (next) => {
    try {
      const validated = workspaceSchema.parse(next);
      if (blocked)
        throw new Error(initial.error ?? 'Importiere ein gültiges Backup.');
      saveLocal(storageKey, validated);
      setWorkspace(validated);
      setError(null);
      setNotice('');
    } catch (e) {
      setError(errorText(e));
    }
  };
  const replace: Update = (next) => {
    try {
      const valid = workspaceSchema.parse(next);
      saveLocal(storageKey, valid);
      setWorkspace(valid);
      setBlocked(false);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const updateCourse = (course: Course) =>
    update({
      ...workspace,
      courses: workspace.courses.map((c) => (c.id === course.id ? course : c)),
    });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        workspace.preferences.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : workspace.preferences.theme);
    apply();
    media.addEventListener('change', apply);
    document.documentElement.lang = workspace.preferences.locale;
    return () => media.removeEventListener('change', apply);
  }, [workspace.preferences.theme, workspace.preferences.locale]);
  useEffect(() => {
    const listener = () =>
      setSelected(
        location.hash.startsWith('#course/') ? location.hash.slice(8) : null,
      );
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  const [today, setToday] = useState(todayInBerlin);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayInBerlin()), 60000);
    return () => clearInterval(timer);
  }, []);
  const openCourse = (id: string) => {
    setSelected(id);
    location.hash = `course/${id}`;
  };
  const navigate = (next: typeof page) => {
    setSelected(null);
    location.hash = '';
    setPage(next);
  };
  const selectedCourse = workspace.courses.find((c) => c.id === selected);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const cloudSave = () =>
    void run(async () => {
      const r = await saveCloud(workspace, revision);
      setRevision(r);
      setNotice(t('cloudSuccess'));
    });
  const cloudLoad = () =>
    void run(async () => {
      const remote = await loadCloud();
      if (!remote.workspace) {
        setRevision(remote.revision);
        setNotice('Cloud ist leer. Du kannst deinen lokalen Stand hochladen.');
        return;
      }
      confirm(t('replaceBackup'), () => {
        replace(remote.workspace!);
        setRevision(remote.revision);
        setNotice(t('cloudSuccess'));
      });
    });
  const completed = workspace.courses.filter(
    (c) => calculateProgress(c, today).status === 'completed',
  ).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={() => navigate('overview')}
          aria-label="Back on Track"
        >
          <span className="brand-mark">
            <Flag size={21} />
          </span>
          <span>
            back on track<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">{t('workspace')}</div>
        <nav aria-label="Hauptnavigation">
          <button
            className={
              !selected && page === 'overview'
                ? 'nav-item selected'
                : 'nav-item'
            }
            onClick={() => navigate('overview')}
          >
            <LayoutDashboard size={18} />
            {t('overview')}
          </button>
          <button
            className={
              !selected && page === 'imports' ? 'nav-item selected' : 'nav-item'
            }
            onClick={() => navigate('imports')}
          >
            <FolderSync size={18} />
            {t('imports')}
          </button>
          <button
            className={
              !selected && page === 'settings'
                ? 'nav-item selected'
                : 'nav-item'
            }
            onClick={() => navigate('settings')}
          >
            <Settings size={18} />
            {t('settings')}
          </button>
        </nav>
        <div className="sidebar-course-heading">
          <span>{t('courses')}</span>
          <button
            className="icon-button"
            aria-label={t('newCourse')}
            onClick={() => setNewCourse(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="sidebar-courses">
          {workspace.courses.map((c, i) => (
            <button
              key={c.id}
              className={`course-link ${selected === c.id ? 'current' : ''}`}
              onClick={() => openCourse(c.id)}
            >
              <span
                className="course-dot"
                style={{ background: colors[i % colors.length] }}
              />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="note">
            <Leaf size={22} />
            <strong>{t('studyNote')}</strong>
            <p>{t('studyNoteText')}</p>
          </div>
          <button className="account" onClick={() => navigate('settings')}>
            <span className="avatar">
              {user?.email?.[0]?.toUpperCase() ?? 'B'}
            </span>
            <span>
              <strong>{user?.email ?? 'Back on Track'}</strong>
              <small>{user ? t('cloud') : t('localOnly')}</small>
            </span>
            <Settings size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb-text">
            {t('workspace')}
            <ChevronRight size={13} />
            <span>{selectedCourse?.name ?? t(page)}</span>
          </div>
          <div className="topbar-right">
            <span className="saved-status">
              <span />
              {t('local')}
            </span>
            <button
              className="icon-button"
              aria-label={t('theme')}
              onClick={() =>
                update({
                  ...workspace,
                  preferences: {
                    ...workspace.preferences,
                    theme: isDark ? 'light' : 'dark',
                  },
                })
              }
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label={t('close')}
                onClick={() => setError(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {selected && !selectedCourse ? (
            <div className="empty-state">
              <h1>Kurs nicht gefunden</h1>
              <button onClick={() => navigate('overview')}>{t('back')}</button>
            </div>
          ) : selectedCourse ? (
            <CourseDetail
              course={selectedCourse}
              update={updateCourse}
              today={today}
              t={t}
              locale={workspace.preferences.locale}
              confirm={confirm}
              onBack={() => navigate('overview')}
              onDelete={() =>
                confirm(t('deleteCourse'), () => {
                  update({
                    ...workspace,
                    courses: workspace.courses.filter(
                      (c) => c.id !== selectedCourse.id,
                    ),
                  });
                  navigate('overview');
                })
              }
            />
          ) : page === 'overview' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {new Intl.DateTimeFormat(workspace.preferences.locale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      timeZone: 'Europe/Berlin',
                    }).format(new Date())}
                  </div>
                  <h1>{t('overviewTitle')}</h1>
                  <p>{t('overviewSubtitle')}</p>
                </div>
                <button className="primary" onClick={() => setNewCourse(true)}>
                  <Plus size={17} />
                  {t('newCourse')}
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  icon={<BookOpen size={19} />}
                  label={t('activeCourses')}
                  value={workspace.courses.length}
                  note={t('yourCourses')}
                />
                <Stat
                  icon={<Check size={19} />}
                  label={t('completed')}
                  value={completed}
                  note={t('completed')}
                />
                <Stat
                  icon={<FileText size={19} />}
                  label={t('materials')}
                  value={workspace.courses.reduce(
                    (n, c) => n + c.items.length,
                    0,
                  )}
                  note={t('total')}
                />
              </div>
              <div className="section-heading">
                <h2>
                  {t('yourCourses')}{' '}
                  <span className="count">{workspace.courses.length}</span>
                </h2>
                <span className="subtle">{t('tagline')}</span>
              </div>
              {workspace.courses.length ? (
                <div className="course-grid">
                  {workspace.courses.map((course, index) => {
                    const p = calculateProgress(course, today);
                    return (
                      <button
                        className="course-card"
                        key={course.id}
                        onClick={() => openCourse(course.id)}
                      >
                        <div className="card-top">
                          <span
                            className="course-icon"
                            style={{
                              color: colors[index % colors.length],
                              background: `${colors[index % colors.length]}16`,
                            }}
                          >
                            <BookOpen size={20} />
                          </span>
                          <span
                            className={`pill ${p.status === 'overdue' ? 'danger' : ''}`}
                          >
                            {t(course.mode)}
                          </span>
                          <ArrowUpRight className="card-arrow" size={18} />
                        </div>
                        <h3>{course.name}</h3>
                        <p className="course-description">
                          {course.description ||
                            `${course.items.length} ${t('materials')}`}
                        </p>
                        <ProgressLabel p={p} t={t} large />
                        <ProgressBars progress={p} t={t} compact />
                        <div className="card-footer">
                          <span>
                            <CalendarDays size={14} />
                            {formatDate(
                              p.deadline,
                              workspace.preferences.locale,
                            )}
                          </span>
                          <span>
                            {course.items.length} {t('materials')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-art">
                    <BookOpen size={38} />
                    <span>
                      <Plus size={18} />
                    </span>
                  </div>
                  <h2>{t('emptyTitle')}</h2>
                  <p>{t('emptyText')}</p>
                  <button
                    className="primary"
                    onClick={() => setNewCourse(true)}
                  >
                    <Plus size={17} />
                    {t('create')}
                  </button>
                </div>
              )}
              <div className="import-banner">
                <span className="banner-icon">
                  <FolderSync size={25} />
                </span>
                <div>
                  <strong>KIT ILIAS × Back on Track</strong>
                  <p>{t('syncText')}</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate('imports')}
                >
                  {t('imports')}
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : page === 'imports' ? (
            <ImportPage
              workspace={workspace}
              update={update}
              replace={replace}
              t={t}
              confirm={confirm}
              onError={setError}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BACK ON TRACK</div>
                  <h1>{t('settings')}</h1>
                  <p>{t('tagline')}</p>
                </div>
              </div>
              <section className="panel">
                <h2>{t('theme')}</h2>
                <div className="form-grid">
                  <Field label={t('theme')}>
                    <select
                      value={workspace.preferences.theme}
                      onChange={(e) =>
                        update({
                          ...workspace,
                          preferences: {
                            ...workspace.preferences,
                            theme: e.target
                              .value as Workspace['preferences']['theme'],
                          },
                        })
                      }
                    >
                      {(['light', 'dark', 'system'] as const).map((v) => (
                        <option key={v} value={v}>
                          {t(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('language')}>
                    <select
                      value={workspace.preferences.locale}
                      onChange={(e) =>
                        update({
                          ...workspace,
                          preferences: {
                            ...workspace.preferences,
                            locale: e.target.value as 'de' | 'en',
                          },
                        })
                      }
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                </div>
              </section>
              <section className="panel">
                <h2>
                  <Cloud size={20} />
                  {t('cloud')}
                </h2>
                <p>{t('cloudText')}</p>
                {!cloud ? (
                  <div className="alert">{t('unconfigured')}</div>
                ) : user ? (
                  <>
                    <p className="signed-in">{user.email}</p>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={cloudSave}
                      >
                        <Upload size={16} />
                        {t('uploadCloud')}
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={cloudLoad}
                      >
                        <Download size={16} />
                        {t('downloadCloud')}
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(async () => {
                            const { error } = await cloud!.auth.signOut();
                            if (error) throw error;
                          })
                        }
                      >
                        <LogOut size={16} />
                        {t('signOut')}
                      </button>
                    </div>
                    <small className="subtle">
                      Cloud-Revision: {revision}. {busy ? t('waiting') : ''}
                    </small>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      const data = formData(e);
                      void run(async () => {
                        const { error } = await cloud!.auth.signInWithOtp({
                          email: str(data, 'email'),
                          options: { emailRedirectTo: location.origin },
                        });
                        if (error) throw error;
                        setNotice(t('emailSent'));
                      });
                    }}
                    className="auth-form"
                  >
                    <Field label={t('email')}>
                      <input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="du@example.de"
                      />
                    </Field>
                    <button className="primary" disabled={busy}>
                      {t('signIn')}
                    </button>
                  </form>
                )}
              </section>
              <RulesEditor workspace={workspace} update={update} t={t} />
            </>
          )}
          <footer className="page-footer">
            <span>back on track.</span>
            <span>{t('datePolicy')}</span>
          </footer>
        </main>
      </div>
      {newCourse && (
        <Modal title={t('create')} onClose={() => setNewCourse(false)}>
          <form
            onSubmit={(e) => {
              const d = formData(e);
              const course = createCourse(str(d, 'name'), str(d, 'start'));
              course.description = str(d, 'description');
              course.examDate = nullable(d, 'exam');
              update({ ...workspace, courses: [...workspace.courses, course] });
              setNewCourse(false);
              openCourse(course.id);
            }}
          >
            <Field label={t('name')}>
              <input
                name="name"
                required
                maxLength={300}
                placeholder="z. B. Lineare Algebra"
                autoFocus
              />
            </Field>
            <Field label={t('description')}>
              <textarea name="description" maxLength={3000} rows={2} />
            </Field>
            <div className="form-grid">
              <Field label={t('startDate')}>
                <input
                  name="start"
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                  required
                  defaultValue={today}
                />
              </Field>
              <Field label={t('examDate')}>
                <input
                  name="exam"
                  type="date"
                  min="1900-01-01"
                  max="9999-12-31"
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setNewCourse(false)}
              >
                {t('cancel')}
              </button>
              <button className="primary">
                {t('create')}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal title={t('review')} onClose={() => setConfirmation(null)}>
          <p>{confirmation.text}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirmation(null)}>
              {t('cancel')}
            </button>
            <button
              className="primary"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {t('confirmReplace')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
