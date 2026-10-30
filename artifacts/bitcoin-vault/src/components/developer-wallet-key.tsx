import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { getDeveloperSession, rotateDeveloperWalletKey, type DeveloperSession, type DeveloperWalletKeyRequestScopesItem } from '@workspace/api-client-react';
import { Section, Field, Alert, Tag, inputCls, btnCls, ghostCls, errStatusOf, errText } from '@/components/wallet-foundation-kit';

const SCOPES: DeveloperWalletKeyRequestScopesItem[] = ['wallet:read', 'wallet:write', 'wallet:fees', 'wallet:simulate'] as DeveloperWalletKeyRequestScopesItem[];
// Existing developer passkey sign-in; signing in again with a passkey refreshes the step-up window.
const LOGIN = '/developers/login';
const REAUTH = '/developers/login';

/** Developer-session (cookie + CSRF) wallet key management. Never uses owner credentials. Key lives only in component state. */
export function DeveloperWalletKey() {
  const [s, setS] = useState<DeveloperSession | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [scopes, setScopes] = useState<Set<string>>(new Set(['wallet:read']));
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);

  const probe = useCallback(() => {
    const g = ++generation.current;
    setKey(null); setShow(false); setBusy(false);
    setState('loading');
    getDeveloperSession()
      .then((d) => { if (alive.current && g === generation.current) { setS(d); setState('ready'); } })
      .catch((e) => { if (!alive.current || g !== generation.current) return; if (errStatusOf(e) === 401) { setS(null); setState('ready'); } else setState('error'); });
  }, []);
  useEffect(probe, [probe]);

  const clear = (msg: string) => { generation.current++; setKey(null); setShow(false); setS(null); setBusy(false); setConfirmRotate(false); setConfirmRevoke(false); setNotice(msg); };

  const submit = async (revoke: boolean) => {
    if (busy || !s?.csrfToken) return;
    const g = generation.current;
    setBusy(true); setError(null); setStepUp(false); setNotice(null);
    try {
      const r = await rotateDeveloperWalletKey(
        { scopes: [...scopes] as DeveloperWalletKeyRequestScopesItem[], ...(revoke ? { revoke: true } : {}) },
        { credentials: 'include', headers: { 'x-developer-csrf': s.csrfToken } },
      );
      if (!alive.current || g !== generation.current) return;
      setConfirmRotate(false); setConfirmRevoke(false);
      if (revoke || r.revoked) { setKey(null); setShow(false); setNotice('Wallet key revoked. Any client using it will now be rejected.'); }
      else { setKey(r.key); setShow(false); setNotice(null); }
    } catch (e) {
      if (!alive.current || g !== generation.current) return;
      const st = errStatusOf(e);
      if (st === 401) { clear('Developer session ended. Key and session were cleared; sign in again.'); return; }
      if (st === 403) setStepUp(true);
      setError(errText(e));
    } finally { if (alive.current && g === generation.current) setBusy(false); }
  };

  const copy = () => { if (key) void navigator.clipboard?.writeText(key).then(() => setNotice('Copied to clipboard.'), () => setError('Copy failed; select and copy manually.')); };

  let body;
  if (state === 'loading') body = <p role="status" className="text-xs text-muted-foreground">Checking developer session…</p>;
  else if (state === 'error') body = <div className="flex items-center gap-2 text-xs"><Alert text="Could not check developer session." /><button type="button" className={ghostCls} onClick={probe}>Retry</button></div>;
  else if (!s?.authenticated) body = (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">Sign in with your developer account (passkey) to generate a wallet API key. Owner vault sessions are never used here.</p>
      {notice && <p role="status" className="text-muted-foreground">{notice}</p>}
      <div className="flex gap-2"><Link href={LOGIN} className={ghostCls}>Developer sign-in</Link><button type="button" className={ghostCls} onClick={probe}>I signed in, check again</button></div>
    </div>
  );
  else if (s.level !== 'full' || !s.csrfToken) body = (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">Your developer session is still in onboarding. Finish verification and passkey enrollment first.</p>
      <div className="flex gap-2"><Link href="/developers" className={ghostCls}>Continue onboarding</Link><button type="button" className={ghostCls} onClick={probe}>Check again</button></div>
    </div>
  );
  else body = (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-3 text-xs" disabled={busy}>
        <legend className="mb-1 font-mono uppercase tracking-[0.12em] text-muted-foreground">Scopes</legend>
        {SCOPES.map((sc) => (
          <label key={sc} className="flex items-center gap-1.5 font-mono">
            <input type="checkbox" checked={scopes.has(sc)} onChange={(e) => { const n = new Set(scopes); if (e.target.checked) n.add(sc); else n.delete(sc); setScopes(n); }} />{sc}
          </label>
        ))}
      </fieldset>
      <p className="text-[11px] text-muted-foreground">Requires a passkey confirmation within the last 5 minutes. Generating a key immediately invalidates any previous wallet key.</p>
      {!confirmRotate && !confirmRevoke && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} disabled={busy || scopes.size === 0} onClick={() => setConfirmRotate(true)}>Generate / rotate key</button>
          <button type="button" className={ghostCls} disabled={busy} onClick={() => setConfirmRevoke(true)}>Revoke key</button>
        </div>
      )}
      {confirmRotate && (
        <div role="alertdialog" aria-label="Confirm rotation" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 p-2 text-xs">
          <span>The old key stops working immediately. Continue?</span>
          <button type="button" className={btnCls} disabled={busy || scopes.size === 0} onClick={() => void submit(false)}>{busy ? 'Working…' : 'Yes, rotate'}</button>
          <button type="button" className={ghostCls} disabled={busy} onClick={() => setConfirmRotate(false)}>Cancel</button>
        </div>
      )}
      {confirmRevoke && (
        <div role="alertdialog" aria-label="Confirm revoke" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          <span>Revoke the current wallet key? Clients using it will be rejected.</span>
          <button type="button" className={btnCls} disabled={busy} onClick={() => void submit(true)}>{busy ? 'Working…' : 'Yes, revoke'}</button>
          <button type="button" className={ghostCls} disabled={busy} onClick={() => setConfirmRevoke(false)}>Cancel</button>
        </div>
      )}
      <Alert text={error} />
      {stepUp && <p className="text-xs">Fresh passkey confirmation needed. <Link href={REAUTH} className="underline">Confirm with passkey</Link>, then return here and retry.</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {key && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Field label="New wallet key (shown once)" hint="Held in this tab's memory only. Not stored or logged; dismiss or reload to forget.">
            <input readOnly type={show ? 'text' : 'password'} value={key} autoComplete="off" spellCheck={false} className={`${inputCls} font-mono`} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="flex gap-2">
            <button type="button" className={ghostCls} onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
            <button type="button" className={ghostCls} onClick={copy}>Copy</button>
            <button type="button" className={ghostCls} onClick={() => { setKey(null); setShow(false); setNotice(null); }}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Section title="Developer wallet API key" meta={s?.authenticated ? <Tag tone="ok">{s.email ?? 'developer'}</Tag> : <Tag>developer session</Tag>}>
      {body}
    </Section>
  );
}
