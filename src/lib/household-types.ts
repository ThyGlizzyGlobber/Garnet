import { ALLOWANCE_PERIODS, HOUSEHOLD_TYPES, MEMBER_ROLES } from '@/db/schema';

/**
 * Household types and the roles each allows (SCOPE-accounts.md §7, from the
 * owner's mum's wizard). Pure, so client components can use it: the setup
 * wizard, the member form and the split editor. Underneath, only `owner`
 * changes what someone may do (src/lib/roles.ts); the other roles say who
 * they are, and a boarder pays shares only where an admin puts them (D14).
 */
export type HouseholdType = (typeof HOUSEHOLD_TYPES)[number];
export type Role = (typeof MEMBER_ROLES)[number];

export const isHouseholdType = (v: unknown): v is HouseholdType =>
  (HOUSEHOLD_TYPES as readonly unknown[]).includes(v);
export const isRole = (v: unknown): v is Role => (MEMBER_ROLES as readonly unknown[]).includes(v);

/** The roles people can have in a household of this type; untyped households keep Admin and Member. */
export function rolesForType(type: HouseholdType | null): Role[] {
  switch (type) {
    case 'own_home':
      return ['owner', 'family'];
    case 'investment_property':
      return ['owner', 'tenant', 'boarder'];
    case 'share_house':
      return ['owner', 'tenant', 'boarder'];
    default:
      return ['owner', 'member'];
  }
}

/** The role a housemate gets by default (when invited, or when an admin steps down). */
export function defaultRole(type: HouseholdType | null): Role {
  return rolesForType(type).find((r) => r !== 'owner') ?? 'member';
}

/** A role that fits this type; anything else becomes the type's default housemate role. */
export function roleFor(type: HouseholdType | null, role: Role): Role {
  return rolesForType(type).includes(role) ? role : role === 'owner' ? 'owner' : defaultRole(type);
}

/**
 * The message key for a role's name: admins are "Admin", or "Owner/Landlord"
 * in an investment property (messages/en.json → roles).
 */
export function roleKey(role: string, type: HouseholdType | null): string {
  if (role === 'owner') return type === 'investment_property' ? 'landlord' : 'owner';
  return isRole(role) ? role : 'member';
}

/**
 * Whether a new household of this type splits its bills (§7): a share house
 * and a let property do; an own home keeps one total, its family see-only
 * unless the admin sets a split (D15).
 */
export function splitModeFor(type: HouseholdType | null): 'shared' | 'single' {
  return type === 'own_home' ? 'single' : 'shared';
}

/** The icon for a household of this type (the switcher, the tiles). */
export function typeIcon(type: HouseholdType | null): string {
  switch (type) {
    case 'investment_property':
      return 'building';
    case 'share_house':
      return 'users';
    default:
      return 'home';
  }
}

/**
 * Who pays no share of a service unless an admin puts them in: boarders (D14),
 * and the landlord of a let property, whose tenants split the utilities
 * between them (D16; the landlord's own costs are their personal services).
 */
export const paysNoShareByDefault = (role: string, type: HouseholdType | null): boolean =>
  role === 'boarder' || (role === 'owner' && type === 'investment_property');

export type AllowancePeriod = (typeof ALLOWANCE_PERIODS)[number];
