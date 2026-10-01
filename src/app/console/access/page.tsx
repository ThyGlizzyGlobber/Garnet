import { getTranslations } from 'next-intl/server';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { SectionHead } from '@/components/ui/blocks';
import { Chip } from '@/components/ui/chip';
import { InlineAction } from '@/components/ui/form';
import { earlyAccessOn, listAllowed, listRequests } from '@/lib/access';
import { formatDateTime } from '@/lib/format';
import {
  allowEmailsAction,
  decideRequestAction,
  disallowEmailAction,
  setEarlyAccessAction,
} from '../actions';

/** Who may sign up (SCOPE-console.md §3d): the switch, the requests, the list. */
export default async function ConsoleAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { added } = await searchParams;
  const t = await getTranslations('console.access');
  const on = earlyAccessOn();
  const requests = listRequests();
  const open = requests.filter((r) => !r.decidedAt);
  const decided = requests.filter((r) => r.decidedAt).slice(0, 20);
  const list = listAllowed();
  const when = (iso: string) => formatDateTime(iso, 'en-AU', 'Australia/Melbourne');
  return (
    <div className="grid gap-4">
      <Card>
        <SectionHead
          title={t('switch')}
          right={<Chip tone={on ? 'ok' : 'warn'}>{on ? t('switchOn') : t('switchOff')}</Chip>}
        />
        <p className="muted set-lede">{t('lede')}</p>
        <div className="set-acts">
          {on ? (
            <InlineAction
              action={setEarlyAccessAction}
              hidden={{ on: 'off' }}
              label={t('turnOff')}
              variant="secondary"
              confirm={t('turnOffConfirm')}
            />
          ) : (
            <InlineAction action={setEarlyAccessAction} hidden={{ on: 'on' }} label={t('turnOn')} />
          )}
        </div>
      </Card>

      <Card>
        <SectionHead title={t('requests')} />
        {open.length === 0 && decided.length === 0 ? (
          <p className="muted">{t('noRequests')}</p>
        ) : (
          <div className="con-scroll">
            <table className="con-table">
              <tbody>
                {[...open, ...decided].map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                      <br />
                      <span className="mono small">{r.email}</span>
                    </td>
                    <td className="muted small">{r.message ?? ''}</td>
                    <td className="muted small">{when(r.createdAt)}</td>
                    <td>
                      {r.decidedAt ? (
                        <Chip tone={r.outcome === 'approved' ? 'ok' : 'neutral'}>
                          {r.outcome === 'approved' ? t('approved') : t('declined')}
                        </Chip>
                      ) : (
                        <div className="acts">
                          <InlineAction
                            action={decideRequestAction}
                            hidden={{ id: r.id, outcome: 'approved' }}
                            label={t('approve')}
                          />
                          <InlineAction
                            action={decideRequestAction}
                            hidden={{ id: r.id, outcome: 'declined' }}
                            label={t('decline')}
                            variant="ghost"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHead title={t('list')} />
        {added !== undefined && <p className="notice">{t('added', { count: Number(added) })}</p>}
        <form action={allowEmailsAction} className="grid gap-3">
          <Field label={t('add')} hint={t('addHint')}>
            <Textarea name="emails" rows={3} required />
          </Field>
          <Field label={t('note')} hint={t('noteHint')} optional>
            <Input name="note" maxLength={80} />
          </Field>
          <div>
            <Button type="submit" size="sm">
              {t('addCta')}
            </Button>
          </div>
        </form>
        {list.length === 0 ? (
          <p className="muted">{t('empty')}</p>
        ) : (
          <div className="con-scroll">
            <table className="con-table">
              <thead>
                <tr>
                  <th>{t('email')}</th>
                  <th>{t('note')}</th>
                  <th>{t('addedBy')}</th>
                  <th>{t('used')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.email}>
                    <td className="mono">{a.email}</td>
                    <td className="muted small">{a.note ?? ''}</td>
                    <td className="muted small">{when(a.addedAt)}</td>
                    <td className="muted small">{a.usedAt ? when(a.usedAt) : t('notUsed')}</td>
                    <td>
                      <InlineAction
                        action={disallowEmailAction}
                        hidden={{ email: a.email }}
                        label={t('remove')}
                        variant="ghost"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
