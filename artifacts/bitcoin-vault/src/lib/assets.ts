/** Resolve a file in /public against the deployed base path. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
export const BRAND_MARK = asset('assets/strongroom/brand/main-vault-mark.svg');
export const LOGIN_HERO = asset('assets/strongroom/heroes/login/vault-door-coins.jpeg');
export const LIVE_HERO = asset('assets/strongroom/heroes/live/live-banner.jpeg');
/** Developer intro media. Portrait 9:16 clip and poster in /public; the Intro falls back to brand art on error. */
export const DEVELOPER_INTRO_VIDEO = asset('developer-intro.mp4');
export const DEVELOPER_INTRO_POSTER = asset('developer-intro.jpg');
