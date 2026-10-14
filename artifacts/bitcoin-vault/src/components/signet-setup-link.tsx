/** Temporary commissioning shortcut; use a document navigation, not the SPA router. */
export function SignetSetupLink() {
  return (
    <aside className="rounded-2xl border border-border bg-card p-4">
      <a
        href={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}signet-setup.html`}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-testid="button-signet-setup"
      >
        Signet setup
      </a>
      <p className="mt-2 text-xs text-muted-foreground">
        Temporary setup tool · Generate a test-wallet backup and deployment variables on this device. Signet only, not real Bitcoin or your login key.
      </p>
    </aside>
  );
}
