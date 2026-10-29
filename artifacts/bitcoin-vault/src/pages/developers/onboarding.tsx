import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Inbox, KeyRound, RotateCw } from 'lucide-react';
import { Card, DevFrame, KeyReveal, Notice, useReducedMotion } from '@/components/developer-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BRAND_MARK } from '@/lib/assets';
import { DEV_KEY_RE, EMAIL_KEY_RE, devErr, nextStep, useDev, useDevAction, useRefreshSession, webAuthnErr } from '@/lib/developer';
import { errStatus } from '@/lib/vault';
import { outcomeUnknown } from '@/lib/sandbox';

export function Verify() {
  const { session, email, setEmail } = useDev();
  const [, nav] = useLocation();
  const refresh = useRefreshSession();
  const verify = useDevAction();
  const resend = useDevAction();
  const [mail, setMail] = useState(email || session.email || '');
  const [key, setKey] = useState('');
  const k = key.trim();
  const keyOk = EMAIL_KEY_RE.test(k);

  if (session.authenticated && session.verified) {
    return <DevFrame step="Verify" title="Email verified."><Link href={nextStep(session)} className="pill-btn" data-testid="link-verified-continue">Continue</Link></DevFrame>;
  }
  const status = errStatus(verify.error);
  const verr = status === 410 ? 'This key has expired. Request a new one below.' : status === 400 || status === 404 || status === 409 ? 'That key is invalid, expired or already used. Check for a newer email, or resend.' : status === 429 ? 'Too many attempts. Wait a moment, then try again.' : devErr(verify.error, 'Verification failed.');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyOk || !mail.trim() || verify.isPending) return;
    setEmail(mail.trim());
    verify.mutate({ action: 'verify-email', data: { email: mail.trim(), key: k } }, {
      onSuccess: async () => { setKey(''); const r = await refresh(); void r; nav('/passkey'); },
    });
  };
  return (
    <DevFrame step="Verify" title="Paste the key from your email." desc={<>We sent a 24-character key{mail ? <> to <span className="font-semibold text-foreground">{mail}</span></> : null}. It works once and expires after about 15 minutes.</>}
      aside={<Card><div className="flex items-center gap-2 font-semibold text-foreground"><Inbox className="h-4 w-4" /> Not there?</div><p className="mt-2">Check Inbox, Spam and Junk folders. Messages can take a minute. Sending a new key cancels the previous one.</p></Card>}>
      <Card>
        <form onSubmit={submit} className="grid gap-4">
          {!email && <div className="grid gap-1.5"><Label htmlFor="v-email">Email</Label><Input id="v-email" type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} className="h-12 rounded-2xl" data-testid="input-verify-email" /><span className="text-[12px] text-muted-foreground">Your email is kept in memory only, so after a refresh we ask again.</span></div>}
          <div className="grid gap-1.5"><Label htmlFor="v-key">Verification key</Label>
            <Input id="v-key" value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} autoComplete="one-time-code" maxLength={40} className="h-12 rounded-2xl font-mono tracking-wider" placeholder="24 characters" data-testid="input-verify-key" />
            <span className="text-[12px] text-muted-foreground">{k.length}/24{k && !keyOk ? ' · letters, digits, - and _ only' : ''}</span></div>
          {verify.isError && <Notice tone="bad" testId="status-verify-error">{verr}</Notice>}
          <Button type="submit" className="h-12 rounded-full font-bold" disabled={!keyOk || !mail.trim() || verify.isPending} data-testid="button-verify">{verify.isPending ? 'Checking' : 'Verify email'}</Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-[13px]">
          <Button type="button" variant="outline" className="rounded-full" disabled={!mail.trim() || resend.isPending} onClick={() => resend.mutate({ action: 'resend', data: { email: mail.trim() } })} data-testid="button-resend"><RotateCw className="h-4 w-4" /> {resend.isPending ? 'Sending' : 'Send a new key'}</Button>
          {resend.isSuccess && <span className="text-ok" data-testid="status-resend-ok">If the address is registered, a new key is on its way.</span>}
          {resend.isError && <span className="text-destructive" data-testid="status-resend-error">{errStatus(resend.error) === 429 ? 'Please wait before requesting another key.' : devErr(resend.error, 'Could not send. Try again shortly.')}</span>}
        </div>
      </Card>
    </DevFrame>
  );
}

export function Passkey() {
  const { session } = useDev();
  const [, nav] = useLocation();
  const refresh = useRefreshSession();
  const opts = useDevAction();
  const ver = useDevAction();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = browserSupportsWebAuthn();

  if (session.passkeyEnrolled) {
    return <DevFrame step="Passkey" title="Passkey enrolled."><Link href={nextStep(session)} className="pill-btn" data-testid="link-passkey-continue">Continue</Link></DevFrame>;
  }
  const enroll = async () => {
    setErr(null); setBusy(true);
    try {
      const o = await opts.mutateAsync({ action: 'passkey-register-options', data: {} });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await startRegistration({ optionsJSON: o as any });
      await ver.mutateAsync({ action: 'passkey-register-verify', data: { response: response as unknown as Record<string, unknown> } });
      await refresh();
      nav('/provision');
    } catch (e) { setErr(webAuthnErr(e)); }
    finally { setBusy(false); }
  };
  return (
    <DevFrame step="Passkey" title="Add a passkey to this account." desc="Required. Your passkey signs you in and is the only way to replace a lost login key. There is no skip."
      aside={<Card><p>A passkey lives in your device, password manager or security key. The server keeps only its public half.</p></Card>}>
      <Card>
        {!supported ? (
          <Notice tone="warn" testId="status-webauthn-unsupported">This browser does not support passkeys, so setup cannot continue here. Open this page in a current version of Safari, Chrome, Edge or Firefox, on a device with a screen lock or a security key. Your account is saved; sign in again from that browser.</Notice>
        ) : (<>
          <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-cold/10 text-cold"><Fingerprint className="h-7 w-7" /></span><p className="text-[14px] text-muted-foreground">Your browser will ask you to confirm with a fingerprint, face, PIN or security key.</p></div>
          {err && <div className="mt-4"><Notice tone="bad" testId="status-passkey-error">{err}</Notice></div>}
          <Button className="mt-5 h-12 w-full rounded-full font-bold" disabled={busy} onClick={enroll} data-testid="button-enroll-passkey">{busy ? 'Waiting for passkey' : err ? 'Try again' : 'Create passkey'}</Button>
        </>)}
      </Card>
    </DevFrame>
  );
}

const STAGES = ['Reserving your private ledger', 'Assigning a destination identifier', 'Recording the market quote', 'Crediting simulated balance', 'Sealing account from owner funds'];

export function Provision() {
  const { session } = useDev();
  const [, nav] = useLocation();
  const refresh = useRefreshSession();
  const prov = useDevAction();
  const reduced = useReducedMotion();
  const [takingLong, setTakingLong] = useState(false);
  const started = useRef(false);
  const ready = !!session.ready;

  const run = () => { if (prov.isPending || ready) return; prov.mutate({ action: 'provision', data: {} }, { onSettled: () => { void refresh(); } }); };
  useEffect(() => { if (!started.current && !ready) { started.current = true; run(); } }); // fires once
  useEffect(() => {
    setTakingLong(false);
    if (!prov.isPending) return;
    const t = setTimeout(() => setTakingLong(true), 20000);
    return () => clearTimeout(t);
  }, [prov.isPending]);
  // Poll server readiness (read only) while waiting; a lost response never triggers a second write.
  useEffect(() => { if (ready) return; const t = setInterval(() => { void refresh(); }, 4000); return () => clearInterval(t); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = errStatus(prov.error);
  const failed = prov.isError && !ready;
  return (
    <DevFrame step="Provision" title={ready ? 'Your Sandbox is ready.' : failed ? 'Setup needs attention.' : 'Setting up your Sandbox.'} desc={ready ? 'Your workspace is ready. Continue to securely save your login key.' : failed ? 'We couldn’t finish preparing your workspace. Your passkey is saved.' : 'We’re preparing your workspace and test balance.'}>
      <Card testId="card-provision">
        <div className="relative mx-auto grid h-44 w-44 place-items-center" aria-hidden>
          {!reduced && !failed && !ready && <>
            <span className="absolute inset-0 rounded-full border-2 border-dashed border-cold/40 [animation:spin_9s_linear_infinite]" />
            <span className="absolute inset-5 rounded-full border border-primary/40 [animation:spin_5s_linear_infinite_reverse]" />
            <span className="absolute inset-10 rounded-full bg-cold/10 [animation:pulse_2.4s_ease-in-out_infinite]" />
          </>}
          {(reduced || failed || ready) && <span className="absolute inset-0 rounded-full border-2 border-cold/40" />}
          <img src={BRAND_MARK} alt="" className="relative h-14 w-14" />
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Workspace setup" aria-valuetext={ready ? 'Complete' : failed ? 'Setup paused' : 'Awaiting confirmation'}>
          <div className={`h-full origin-left rounded-full ${ready ? 'bg-ok' : 'bg-cold'}`} style={{ transform: `scaleX(${ready ? 1 : 0})` }} />
        </div>
        <ul className="mt-5 grid gap-1.5 text-[13.5px]" data-testid="list-provision-stages">
          {STAGES.map((s) => (
            <li key={s} className={ready ? 'text-foreground' : 'text-muted-foreground'}>{ready ? 'Done' : failed ? 'Pending' : 'Preparing'} · {s}</li>
          ))}
        </ul>
        <div className="mt-5" aria-live="polite">
          {ready ? <Notice tone="ok" testId="status-provision-ready">Your workspace and test balance are ready.</Notice>
            : failed ? (
              <Notice tone={outcomeUnknown(prov.error) && st !== 503 ? 'warn' : 'bad'} testId="status-provision-error">
                {st === 503 ? 'The pricing service is unavailable. Setup needs a current BTC/USD rate to calculate your test balance. Nothing has been credited. Retry once the service is restored.'
                  : outcomeUnknown(prov.error) ? 'The response was interrupted. Checking with the server; retrying is safe and never credits twice.'
                  : devErr(prov.error, 'Provisioning failed.')}
              </Notice>
            ) : <p role="status" className="text-[13px] text-muted-foreground" data-testid="status-provisioning">{takingLong ? 'This is taking longer than expected. We’re checking your setup status; please don’t create another account.' : 'Preparing your workspace. This page updates when setup is confirmed.'}</p>}
        </div>
        {failed && <Button variant="outline" className="mt-4 rounded-full" onClick={run} disabled={prov.isPending} data-testid="button-provision-retry"><RotateCw className="h-4 w-4" /> Retry provisioning</Button>}
        {ready && <Button className="mt-4 h-12 w-full rounded-full font-bold" onClick={() => nav('/key')} data-testid="button-provision-continue">Continue</Button>}
      </Card>
    </DevFrame>
  );
}

export function KeyPage() {
  const { session } = useDev();
  const [, nav] = useLocation();
  const refresh = useRefreshSession();
  const issue = useDevAction<{ key?: string; message?: string }>();
  const [key, setKey] = useState<string | null>(null);

  const done = async () => { setKey(null); issue.reset(); await refresh(); nav('/sandbox'); };
  if (key) return <DevFrame step="Key" title="Save your login key." desc={issue.data?.message ?? 'Use it with your email to sign in on any device.'}><KeyReveal value={key} onDone={done} /></DevFrame>;

  const st = errStatus(issue.error);
  const lost = (issue.isError && (st === 403 || st === 409 || outcomeUnknown(issue.error))) || (issue.isSuccess && !key);
  if (session.keyIssued || lost) {
    return (
      <DevFrame step="Key" title="Recover your login key access." desc="A saved key is never shown twice. Fresh passkey confirmation lets you replace it safely.">
        <Card testId="card-key-recovery">
          <p className="text-[14px] text-muted-foreground">If you saved it, you are done. If the page was interrupted before you could save it, confirm with your passkey on the Security page and rotate: a new key is issued and the old one stops working.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/live" className="pill-btn" data-testid="link-key-rotate"><KeyRound className="h-4 w-4" /> Rotate with passkey</Link>
            <Link href="/sandbox" className="pill-btn" data-testid="link-key-sandbox">Open Sandbox</Link>
          </div>
        </Card>
      </DevFrame>
    );
  }
  return (
    <DevFrame step="Key" title="One last thing: your login key." desc="An 86-character key is generated now and shown once. Have a password manager ready.">
      <Card>
        {issue.isError && <div className="mb-4"><Notice tone="bad">{devErr(issue.error, 'Could not issue key.')}</Notice></div>}
        <Button className="h-12 w-full rounded-full font-bold" disabled={issue.isPending} onClick={() => issue.mutate({ action: 'issue-key', data: {} }, { onSuccess: (r) => { if (r.key && DEV_KEY_RE.test(r.key)) setKey(r.key); } })} data-testid="button-issue-key">{issue.isPending ? 'Generating' : 'Show my key'}</Button>
      </Card>
    </DevFrame>
  );
}
