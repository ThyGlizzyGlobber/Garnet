import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { member } from '@/db/schema';
import { createHousehold, type HouseholdInput } from '@/lib/households';
import { setHouseholdLocation } from '@/lib/location';
import { createMember } from '@/lib/members';
import { setRegionalSharing } from '@/lib/regional';
import { ADMIN_ROLE } from '@/lib/roles';

/**
 * Create a household from the setup wizard, all or nothing: the household, its
 * postcode (optional), the account's own member as its first admin, and the
 * area-comparisons choice (on unless unticked, recorded with the notice
 * version). An account may start any number of households (SCOPE-accounts.md
 * D1); the first one it belongs to becomes its primary.
 */
export function setUpHousehold(
  account: { id: string; email: string },
  input: {
    household: HouseholdInput;
    owner: { name: string; activeFrom: string; colour?: string };
    location: { country: string; postalCode: string; locality: string | null } | null;
    shareRegional: boolean;
  },
  db: Db = getDb(),
): { householdId: string; ownerId: string } {
  return db.transaction((tx) => {
    const first = !tx.select().from(member).where(eq(member.accountId, account.id)).get();
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
        isPrimary: first,
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
