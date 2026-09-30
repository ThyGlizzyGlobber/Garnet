import { getDb, type Db } from '@/db/client';
import { membershipsFor } from '@/lib/accounts';
import { createHousehold, type HouseholdInput } from '@/lib/households';
import { setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { setRegionalSharing } from '@/lib/regional';
import { ADMIN_ROLE } from '@/lib/roles';
import type { Appearance } from '@/lib/appearance';

/**
 * Create a household from the setup wizard, all or nothing: the household, its
 * postcode (optional), the account's own member as its first admin, and the
 * area-comparisons choice (on unless unticked, recorded with the notice
 * version). The owner's own colour and their colours for the app (§4a) go on
 * their member row. The alpha allows one household per account; that is re-checked
 * inside the transaction so two tabs can't create two.
 */
export function setUpHousehold(
  account: { id: string; email: string },
  input: {
    household: HouseholdInput;
    owner: { name: string; activeFrom: string; colour?: string; appearance?: Appearance };
    location: { country: string; postalCode: string; locality: string | null } | null;
    shareRegional: boolean;
  },
  db: Db = getDb(),
): { householdId: string; ownerId: string } {
  return db.transaction((tx) => {
    if (membershipsFor(account.id, tx).length) throw new Error('You already have a household.');
    const hh = createHousehold(input.household, tx);
    if (input.location?.postalCode) setHouseholdLocation(hh.id, input.location, tx);
    const owner = createMember(
      hh.id,
      {
        name: input.owner.name,
        role: ADMIN_ROLE,
        activeFrom: input.owner.activeFrom,
        accountId: account.id,
        email: account.email,
        colour: input.owner.colour,
        appearancePreset: input.owner.appearance?.preset,
        theme: input.owner.appearance?.theme,
      },
      tx,
    );
    setRegionalSharing(
      hh.id,
      input.shareRegional,
      input.shareRegional ? 'default' : 'settings',
      owner.id,
      tx,
    );
    return { householdId: hh.id, ownerId: owner.id };
  });
}
