import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/app/icons';
import { Card } from '@/components/ui';
import { Kv, SectionHead } from '@/components/ui/blocks';
import { Avatar } from '@/components/ui/colour';
import { membershipsFor } from '@/lib/accounts';
import { accountContext } from '../context';
import { NameForm, PhotoButtons } from '../profile-forms';

/**
 * Your profile (owner, 2026-10-02): your photo, name and email at the top,
 * then your details. The name and photo are the same in every household
 * you belong to.
 */
export default async function ProfilePage() {
  const { account, view, name, colour, photo } = await accountContext();
  const t = await getTranslations('profile');
  const names = account ? membershipsFor(account.id).map((m) => m.name) : [];
  const differs = names.filter((n) => n !== account?.name).length;
  return (
    <div className="scr account pf">
      <header className="pf-head glass rounded-card">
        <Avatar name={name} colour={colour} photo={photo} className="pf-av" />
        <h1 className="pf-title">{name}</h1>
        {view.email && (
          <p className="pf-email">
            {view.email}
            <span className="pf-verified" title={t('verified')}>
              <Icon name="check" width={11} height={11} />
            </span>
          </p>
        )}
        {account ? <PhotoButtons hasPhoto={!!photo} /> : <p className="muted small">{t('demo')}</p>}
      </header>
      <div className="pf-grid">
        <Card>
          <SectionHead title={t('personal')} />
          <Kv
            rows={[
              [t('name.label'), account ? <NameForm key="n" initial={account.name} /> : name],
              [t('email'), view.email ?? t('demoEmail')],
              [t('photo.label'), photo ? t('photo.set') : t('photo.unset')],
            ]}
          />
          <p className="set-note mt-2">{t('everywhere', { count: view.tiles.length })}</p>
        </Card>
        <Card>
          <SectionHead title={t('households')} />
          <Kv
            rows={view.tiles.map((h): [string, string] => [
              h.name,
              h.primary ? t('home') : h.current ? t('current') : '',
            ])}
          />
          {differs > 0 && <p className="set-note mt-2">{t('differs', { count: differs })}</p>}
        </Card>
      </div>
    </div>
  );
}
