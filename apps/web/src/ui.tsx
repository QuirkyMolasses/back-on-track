import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Check, X } from 'lucide-react';
import type { Progress, Workspace } from '../../../packages/domain/src/index';
import type { MessageKey } from './i18n';
export type T = (key: MessageKey) => string;
export type Update = (next: Workspace) => void;
export type Confirm = (text: string, action: () => void) => void;
export const colors = ['#477e70', '#a17e4c', '#707ca0', '#9c718d', '#64838e'];
export function errorText(e: unknown): string {
  return e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : 'Unerwarteter Fehler';
}
export function formData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
export const str = (data: FormData, key: string) => String(data.get(key) ?? '');
export const nullable = (data: FormData, key: string) => str(data, key) || null;
export const formatDate = (date: string | null, locale: string) =>
  date
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${date}T00:00:00Z`))
    : '—';
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ProgressBars({
  progress,
  t,
  compact = false,
}: {
  progress: Progress;
  t: T;
  compact?: boolean;
}) {
  return (
    <div className={`progress-bars ${compact ? 'compact' : ''}`}>
      <div className="bar-label">
        <span>{t('actual')}</span>
        <strong>
          {progress.actual === null
            ? '—'
            : `${Math.round(progress.actual * 100)}%`}
        </strong>
      </div>
      <div
        className="bar-track"
        role="progressbar"
        aria-label={t('actual')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          progress.actual === null
            ? undefined
            : Math.round(progress.actual * 100)
        }
      >
        <span style={{ width: `${(progress.actual ?? 0) * 100}%` }} />
      </div>
      <div className="bar-label expected">
        <span>{t('expected')}</span>
        <span>
          {progress.expected === null
            ? '—'
            : `${Math.round(progress.expected * 100)}%`}
        </span>
      </div>
      <div className="bar-track expected">
        <span style={{ width: `${(progress.expected ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
export function ProgressLabel({
  p,
  t,
  large = false,
}: {
  p: Progress;
  t: T;
  large?: boolean;
}) {
  if (p.status === 'completed')
    return (
      <div className={`pace positive ${large ? 'large' : ''}`}>
        <Check size={large ? 28 : 20} />
        <strong>{t('completed')}</strong>
      </div>
    );
  if (p.status === 'overdue')
    return (
      <div className={`pace negative ${large ? 'large' : ''}`}>
        <strong>{p.overdueDays}</strong>
        <span>
          {t('days')} {t('overdue').toLocaleLowerCase()}
        </span>
      </div>
    );
  if (p.daysDelta === null)
    return (
      <div className="pace muted">
        <span>{t(p.status)}</span>
      </div>
    );
  const rounded = Math.round(p.daysDelta * 10) / 10;
  return (
    <div
      className={`pace ${rounded >= 0 ? 'positive' : 'negative'} ${large ? 'large' : ''}`}
    >
      <strong>
        {rounded > 0 ? '+' : ''}
        {rounded.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </strong>
      <span>
        {Math.abs(rounded) < 0.05
          ? t('onTrack')
          : rounded > 0
            ? t('ahead')
            : t('behind')}
      </span>
    </div>
  );
}
export function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="stat">
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, '0')}</strong>
      <small>{note}</small>
    </div>
  );
}
