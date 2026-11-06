// Owner-requested route prefix. This is NOT a secret or authorization boundary.
// API endpoints and Bitcoin storage are deliberately unaffected.
export const OWNER_BASE = '/mainvaultwallet/personal/admin';
// Preserve both the original link and the shortened numeric link shared by the owner.
const LEGACY_OWNER_BASES = [256, 250].map(count =>
  `/${Array.from({ length: count }, (_, i) => i + 1).join('')}/mainvaultwallet`);
export function legacyOwnerRedirect(path: string) {
  const base = LEGACY_OWNER_BASES.find(base => path === base || path.startsWith(`${base}/`));
  return base ? OWNER_BASE + path.slice(base.length) : null;
}
// Owner-authorized homepage cutover. Explicit false remains a rollback switch.
export const DEVELOPER_HOMEPAGE = import.meta.env.VITE_DEVELOPER_HOMEPAGE !== 'false';
export const isOwnerLocation = (path: string) => path === OWNER_BASE || path.startsWith(`${OWNER_BASE}/`);
