import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Lock, LogOut, ArrowRight } from 'lucide-react';
import { Card, DevFrame, DevChip, DevTopBar, KeyReveal, Notice } from '@/components/developer-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEV_KEY_RE, ROTATE_WINDOW_MS, devErr, endDeveloper, nextStep, useDev, useDevAction, useRefreshSession, webAuthnErr } from '@/lib/developer';
import { errStatus, remaining } from '@/lib/vault';
import type { DeveloperSession } from '@workspace/api-client-react';

export function usePasskeySignIn() {
  const opts = useDevAction();
  const ver = useDevAction();
  const refresh = useRefreshSession();
  const { setFreshAt } = useDev();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (email: string): Promise<DeveloperSession | null> => {
    setErr(null); setBusy(true);
    try {
      const o = await opts.mutateAsync({ action: 'passkey-login-options', data: { email } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await startAuthentication({ optionsJSON: o as any });
      await ver.mutateAsync({ action: 'passkey-login-verify', data: { response: response as unknown as Record<string, unknown> } });
      setFreshAt(Date.now());
      const r = await refresh(); void r;
      return null;
    } catch (e) { setErr(errStatus(e) === 401 || errStatus(e) === 404 ? 'Passkey not recognised for that email.' : webAuthnErr(e)); return null; }
    finally { setBusy(false); }
  };
  return { run, busy, err };
}

export function Login() {
  const { session, email, setEmail } = useDev();
  const [, nav] = useLocation();
  const refresh = useRefreshSession();
  const login = useDevAction();
  const pk = usePasskeySignIn();
  const [mail, setMail] = useState(email);
  const [key, setKey] = useState('');
  const k = key.trim();
  const supported = browserSupportsWebAuthn();

  useEffect(() => { if (session.authenticated && !pk.busy && !login.isPending) nav(session.ready && session.keyIssued ? '/sandbox' : nextStep(session)); }, [session.authenticated, session.ready, session.keyIssued, session.passkeyEnrolled, pk.busy, login.isPending, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!DEV_KEY_RE.test(k) || !mail.trim()) return;
    setEmail(mail.trim());
    login.mutate({ action: 'login', data: { email: mail.trim(), key: k } }, { onSuccess: async () => { setKey(''); await refresh(); } });
  };
  const viaPasskey = async () => { if (!mail.trim()) return; setEmail(mail.trim()); await pk.run(mail.trim()); };
  const st = errStatus(login.error);

  return (
    <DevFrame title="Sign in to developer access." desc="Use your passkey, or your email with the 86-character login key."
      aside={<Card><p>Lost your login key? Sign in with your passkey, then rotate it on the Security page. If you lost both, the account cannot be recovered by email.</p><p className="mt-3">New here? <Link href="/apply" className="font-semibold text-foreground underline" data-testid="link-login-apply">Apply</Link></p></Card>}>
      <Card>
        <div className="grid gap-1.5"><Label htmlFor="l-email">Email</Label><Input id="l-email" type="email" autoComplete="username webauthn" value={mail} onChange={(e) => setMail(e.target.value)} className="h-12 rounded-2xl" data-testid="input-login-email" /></div>
        <div className="mt-4">
          {supported
            ? <Button type="button" className="h-12 w-full rounded-full font-bold" disabled={!mail.trim() || pk.busy} onClick={viaPasskey} data-testid="button-login-passkey"><Fingerprint className="h-4 w-4" /> {pk.busy ? 'Waiting for passkey' : 'Sign in with passkey'}</Button>
            : <Notice tone="warn">Passkeys are not supported in this browser. Use your login key below.</Notice>}
          {pk.err && <div className="mt-3"><Notice tone="bad" testId="status-passkey-login-error">{pk.err}</Notice></div>}
        </div>
        <div className="my-5 flex items-center gap-3 text-[12px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submitKey} className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="l-key">Login key</Label>
            <Input id="l-key" type="password" autoComplete="current-password" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} className="h-12 rounded-2xl font-mono" data-testid="input-login-key" />
            <span className="text-[12px] text-muted-foreground">{k.length}/86</span></div>
          {login.isError && <Notice tone="bad" testId="status-login-error">{st === 401 || st === 400 ? 'Email or key not recognised.' : st === 429 ? 'Too many attempts. Wait, then try again.' : devErr(login.error, 'Sign-in failed.')}</Notice>}
          <Button type="submit" variant="outline" className="h-12 rounded-full font-bold" disabled={!DEV_KEY_RE.test(k) || !mail.trim() || login.isPending} data-testid="button-login-key">{login.isPending ? 'Signing in' : 'Sign in with key'}</Button>
        </form>
      </Card>
    </DevFrame>
  );
}

export function Live() {
  const { session, freshAt, setFreshAt } = useDev();
  const refresh = useRefreshSession();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const logout = useDevAction();
  const rotate = useDevAction<{ key?: string; message?: string }>();
  const pk = usePasskeySignIn();
  const [now, setNow] = useState(Date.now());
  const [newKey, setNewKey] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = 'Developer Live · main_vault'; }, []);

  const freshLeft = freshAt ? Math.max(0, Math.ceil((freshAt + ROTATE_WINDOW_MS - now) / 1000)) : 0;
  const doLogout = () => logout.mutate({ action: 'logout', data: {} }, { onSuccess: () => { endDeveloper(qc); nav('/login'); }, onError: (e) => { if(errStatus(e)===401) { endDeveloper(qc); nav('/login'); } } });

  if (newKey) return <DevFrame title="Your new login key." desc="The previous key and your other sessions are now revoked."><KeyReveal value={newKey} onDone={async () => {setNewKey(null);rotate.reset();setFreshAt(0);await refresh();}} doneLabel="Done" /></DevFrame>;

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <DevTopBar right={<><DevChip /><Button variant="outline" className="rounded-full" onClick={doLogout} disabled={logout.isPending} data-testid="button-dev-logout"><LogOut className="h-4 w-4" /> {logout.isPending ? 'Signing out' : 'Sign out'}</Button></>} />
      <main className="mx-auto mt-8 grid w-full max-w-[1120px] gap-6 px-5 md:mt-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:px-8">
        <section className="rise rounded-[24px] bg-sidebar p-6 text-sidebar-foreground md:p-8" data-testid="card-live-locked">
          <Lock className="h-6 w-6 opacity-80" />
          <h1 className="mt-4 font-display text-[2rem] font-bold leading-[1.05] md:text-[2.5rem]">Live is locked for this account.</h1>
          <p className="mt-3 max-w-[50ch] text-[15px] opacity-80" data-testid="text-live-locked">An application approval does not enable real payments. Independent hosting and custody readiness checks must pass separately; no real Bitcoin can move from here. Your Sandbox remains separate.</p>
          <div className="mt-6 inline-flex rounded-full bg-sidebar-foreground/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]" data-testid="status-live-approval">{session.liveApproved ? 'approved' : 'awaiting approval'}</div>
          <div className="mt-6"><Link href="/sandbox" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground" data-testid="link-open-sandbox">Open Sandbox <ArrowRight className="h-4 w-4" /></Link><Link href="/checkout" className="ml-2 mt-2 inline-flex h-12 items-center gap-2 rounded-full border border-sidebar-foreground/30 px-6 text-[15px] font-bold" data-testid="link-open-checkout">Checkout console <ArrowRight className="h-4 w-4" /></Link></div>
        </section>
        <div className="space-y-5">
          <Card testId="card-account">
            <div className="text-[13px] font-semibold">Account</div>
            <dl className="mt-3 grid gap-2 text-[13.5px]">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="font-semibold" data-testid="text-dev-name">{session.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="truncate font-semibold" data-testid="text-dev-email">{session.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Session</dt><dd data-testid="text-dev-session">{remaining(session.expiresAt).label}</dd></div>
            </dl>
          </Card>
          <Card testId="card-security">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><KeyRound className="h-4 w-4 text-cold" /> Rotate login key</div>
            <p className="mt-2 text-[13.5px] text-muted-foreground">Rotation needs a passkey confirmation from the last five minutes. It issues a new key once, revokes the old one and signs out your other sessions.</p>
            <div className="mt-4 grid gap-2">
              <Button variant="outline" className="h-11 rounded-full" disabled={pk.busy || !session.email} onClick={() => session.email && pk.run(session.email)} data-testid="button-reauth-passkey"><Fingerprint className="h-4 w-4" /> {pk.busy ? 'Waiting for passkey' : freshLeft > 0 ? `Confirmed · ${Math.floor(freshLeft / 60)}:${String(freshLeft % 60).padStart(2, '0')} left` : 'Confirm with passkey'}</Button>
              {pk.err && <Notice tone="bad">{pk.err}</Notice>}
              <Button className="h-11 rounded-full font-bold" disabled={!session.ready || freshLeft <= 0 || rotate.isPending} onClick={() => rotate.mutate({ action: 'rotate-key', data: {} }, { onSuccess: (r) => { if (r.key && DEV_KEY_RE.test(r.key)) setNewKey(r.key); else setFreshAt(0); } })} data-testid="button-rotate-key">{rotate.isPending ? 'Rotating' : 'Rotate key'}</Button>
              {rotate.isSuccess && !newKey && <Notice tone="warn">No key was available to save. Confirm your passkey again and replace the key; only the newest key will work.</Notice>}
              {!session.ready && <Link href="/provision" className="pill-btn">Finish provisioning first</Link>}
              {rotate.isError && <Notice tone="bad" testId="status-rotate-error">{errStatus(rotate.error) === 403 || errStatus(rotate.error) === 401 ? 'Passkey confirmation expired. Confirm again, then rotate.' : `${devErr(rotate.error, 'Rotation failed.')} If the result is unclear, confirm with your passkey and rotate again; only the newest key works.`}</Notice>}
            </div>
          </Card>
          {logout.isError && <Notice tone="warn">Server sign-out did not confirm. Please retry; do not assume your session was revoked.</Notice>}
        </div>
      </main>
    </div>
  );
}
