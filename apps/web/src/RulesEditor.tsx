import { Plus, Trash2 } from 'lucide-react';
import type { Workspace } from '../../../packages/domain/src/index';
import { Field, formData, str, nullable, type T, type Update } from './ui';
export function RulesEditor({
  workspace,
  update,
  t,
}: {
  workspace: Workspace;
  update: Update;
  t: T;
}) {
  return (
    <section className="panel">
      <h2>{t('ruleTitle')}</h2>
      <p>{t('ruleText')}</p>
      {workspace.preferences.rules.map((rule, index) => (
        <div className="rule-row" key={index}>
          <code>{rule.contains}</code>
          <span>{rule.category ?? '—'}</span>
          <span>
            {t('relevant')}: {rule.relevant ? '✓' : '✕'}
          </span>
          <button
            className="icon-button"
            aria-label={`${t('delete')} ${rule.contains}`}
            onClick={() =>
              update({
                ...workspace,
                preferences: {
                  ...workspace.preferences,
                  rules: workspace.preferences.rules.filter(
                    (_, i) => i !== index,
                  ),
                },
              })
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <form
        className="rule-form"
        onSubmit={(e) => {
          const d = formData(e);
          update({
            ...workspace,
            preferences: {
              ...workspace.preferences,
              rules: [
                ...workspace.preferences.rules,
                {
                  contains: str(d, 'contains'),
                  category: nullable(d, 'category'),
                  relevant: d.has('relevant'),
                },
              ],
            },
          });
          e.currentTarget.reset();
        }}
      >
        <div className="form-grid">
          <Field label={t('contains')}>
            <input
              name="contains"
              required
              maxLength={100}
              placeholder="z. B. Übungsblatt"
            />
          </Field>
          <Field label={t('category')}>
            <input
              name="category"
              maxLength={300}
              placeholder={t('category')}
            />
          </Field>
        </div>
        <div className="button-row">
          <label className="checkbox-label">
            <input name="relevant" type="checkbox" defaultChecked />
            {t('relevant')}
          </label>
          <button className="secondary">
            <Plus size={15} />
            {t('addRule')}
          </button>
        </div>
      </form>
    </section>
  );
}
