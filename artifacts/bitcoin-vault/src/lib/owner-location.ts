// Owner-requested route prefix. This is NOT a secret or authorization boundary.
// API endpoints and Bitcoin storage are deliberately unaffected.
export const OWNER_BASE = `/${Array.from({ length: 256 }, (_, i) => i + 1).join('')}/mainvaultwallet`;
// Owner-authorized homepage cutover. Explicit false remains a rollback switch.
export const DEVELOPER_HOMEPAGE = import.meta.env.VITE_DEVELOPER_HOMEPAGE !== 'false';
export const isOwnerLocation = (path: string) => path === OWNER_BASE || path.startsWith(`${OWNER_BASE}/`);
