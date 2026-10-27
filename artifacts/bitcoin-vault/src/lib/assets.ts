/** Resolve a file in /public against the deployed base path. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
export const BRAND_MARK = asset('assets/strongroom/brand/main-vault-mark.svg');
export const LOGIN_HERO = asset('assets/strongroom/heroes/login/vault-door-coins.jpeg');
export const LIVE_HERO = asset('assets/strongroom/heroes/live/live-banner.jpeg');
