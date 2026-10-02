import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { AddressCard } from '@/components/ui/blocks';
import { InlineAction } from '@/components/ui/form';
import { viewerIsDeveloper } from '@/lib/auth/session';
import { billsAddress } from '@/lib/bills-address';
import { pageContext } from '@/lib/context';
import { isAdmin } from '@/lib/roles';
import { replaceBillsAddressAction } from '../actions';
import { SettingsSubPage } from '../sub-page';

/** Where the household forwards its bills, how, and (admins) a new address. */
export default async function BillsAddressPage() {
  const { hh, me } = await pageContext();
  const t = await getTranslations('settings');
  const tb = await getTranslations('billsAddress');
  const address = billsAddress(hh);
  const developer = await viewerIsDeveloper();
  return (
    <SettingsSubPage title={t('index.billsAddress.title')} lede={t('index.billsAddress.lede')}>
      <Card>
        {address ? (
          <>
            <AddressCard label={tb('label')} address={address} />
            <p className="set-note mt-2">{tb('howForward')}</p>
            {isAdmin(me) && (
              <div className="set-acts">
                <InlineAction
                  action={replaceBillsAddressAction}
                  label={tb('replace')}
                  variant="ghost"
                  confirm={tb('replaceConfirm')}
                />
              </div>
            )}
          </>
        ) : (
          <p className="set-note">
            {developer ? t('household.noAddress') : t('index.billsAddress.none')}
          </p>
        )}
      </Card>
    </SettingsSubPage>
  );
}
