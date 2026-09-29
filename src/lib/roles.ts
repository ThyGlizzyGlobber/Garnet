/**
 * Household roles. Admins are stored as role "owner" (the name from before a
 * household could have several); the UI calls them Admin. Pure, so client
 * components can use it too.
 */
export const ADMIN_ROLE = 'owner';

export const isAdmin = (m: { role: string } | null | undefined): boolean => m?.role === ADMIN_ROLE;
