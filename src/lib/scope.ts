import { eq, isNull, or, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Which services and bills a read covers. Personal ones (a member's own car
 * rego) are seen only by that member and never count towards household figures:
 *   {}                 household only (every household figure)
 *   { viewer: id }     household + that member's personal ones (what they see)
 *   { owner: id }      only that member's personal ones (their personal dashboard)
 *   { everyone: true } all of them (matching incoming bills, housekeeping)
 */
export interface Scope {
  viewer?: string | null;
  owner?: string | null;
  everyone?: boolean;
}

/** SQL condition on an owner_member_id column for a scope. */
export function ownerCondition(col: SQLiteColumn, scope: Scope = {}): SQL | undefined {
  if (scope.everyone) return undefined;
  if (scope.owner) return eq(col, scope.owner);
  if (scope.viewer) return or(isNull(col), eq(col, scope.viewer));
  return isNull(col);
}

/** The same test in code. */
export function inScope(ownerMemberId: string | null, scope: Scope = {}): boolean {
  if (scope.everyone) return true;
  if (scope.owner) return ownerMemberId === scope.owner;
  return !ownerMemberId || ownerMemberId === scope.viewer;
}

/** Can this member see an item with this owner? */
export const visibleTo = (ownerMemberId: string | null, memberId: string): boolean =>
  !ownerMemberId || ownerMemberId === memberId;
