import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startAuthentication } from '@simplewebauthn/browser';
import { Download, FileKey2, Fingerprint, KeyRound, Lock, ShieldOff, Terminal, Upload } from 'lucide-react';
import { getGetVaultSessionQueryKey, setCsrfToken, useUnlockVault, usePasskeyLoginOptions, usePasskeyLoginVerify, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorPanel, Pill } from '@/components/kit';
import { NAV, VaultMark } from '@/components/shell';
import { CREDENTIAL_RE } from '@/lib/vault';
import { cn } from '@/lib/utils';

const KEYGEN = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/offline-keygen.html`;

export default function LockScreen({ session }: { session: Session }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] opacity-[0.07]">
        <VaultMark className="dial h-full w-full text-sidebar-foreground" />
      </div>
      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="rise">
          <div className="flex items-center gap-3">
            <VaultMark className="h-9 w-9" />
            <span className="font-display text-xl font-extrabold text-sidebar-accent-foreground">Strongroom</span>
          </div>
          <h1 className="font-display mt-10 text-5xl font-extrabold leading-[0.95] text-sidebar-accent-foreground md:text-7xl">
            {session.configured ? <>The door<br />is shut.</> : <>No owner<br />on record.</>}
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-sidebar-foreground/70">
            {session.configured
              ? 'Present the 164-byte offline secret to open this control room. The secret is checked once, never stored in this browser, and exchanged for a short-lived session.'
              : 'This vault has not been bound to an owner. Setup happens offline and server-side: there is no public enrollment, and nothing behind this screen will load until the operator installs your verifier.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-2 font-mono text-[10.5px] uppercase tracking-wider">
            <Pill tone="ember">network {session.network}</Pill>
            <Pill tone={session.configured ? 'cold' : 'warn'}>{session.configured ? 'owner configured' : 'awaiting verifier'}</Pill>
            <Pill tone="bad" dot>vault locked</Pill>
          </div>

          <div className="mt-12 hidden lg:block">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40">sealed rooms</div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {NAV.map((n) => (
                <div key={n.href} className="flex items-center gap-2 rounded-sm border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/40">
                  <n.icon className="h-3.5 w-3.5" /> {n.label}
                  <span className="ml-auto font-mono text-[10px]">disconnected</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rise rise-2">{session.configured ? <UnlockCard retryAfter={session.loginRetryAfterSeconds ?? 0} /> : <SetupCard />}</div>
      </div>
    </div>
  );
}

function SetupCard() {
  const steps = [
    { t: 'Go offline', d: 'Download the generator below, move it to an air-gapped machine, then disconnect networking.' },
    { t: 'Generate the secret', d: 'Open offline-keygen.html in a browser. It draws 164 random bytes and emits a 219-character base64url keyfile plus its verifier.' },
    { t: 'Store the keyfile', d: 'Save the keyfile to removable media. Keep at least two copies in separate physical locations.' },
    { t: 'Install the verifier', d: 'Hand only the verifier (never the secret) to the server operator, who sets it in the server environment and restarts.' },
  ];
  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-6 backdrop-blur" data-testid="panel-setup">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-primary"><Terminal className="h-3.5 w-3.5" /> offline setup</div>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-4">
            <span className="font-mono text-xs text-sidebar-primary">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="text-sm font-semibold text-sidebar-accent-foreground">{s.t}</div>
              <div className="mt-0.5 text-[13px] text-sidebar-foreground/65">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-sm border border-sidebar-border bg-sidebar p-3 font-mono text-[11.5px] text-sidebar-foreground/80">
        <div className="text-sidebar-foreground/40"># on the server, after receiving the verifier</div>
        <div>VAULT_OWNER_VERIFIER=&lt;verifier from keygen&gt;</div>
        <div className="text-sidebar-foreground/40"># restart the API, then reload this page</div>
      </div>
      <div className="mt-5 grid gap-2 text-[12.5px] text-sidebar-foreground/60">
        <div className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sidebar-primary" /> Setup sends only the verifier to the server. Unlocking later sends the credential over HTTPS; protect your device and check the site address.</div>
        <div className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sidebar-primary" /> No protected data is requested while unconfigured. Nothing you see here is fabricated.</div>
      </div>
      <a href={KEYGEN} download data-testid="link-offline-keygen" className="mt-6 flex items-center justify-center gap-2 rounded-sm bg-sidebar-primary px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-sidebar-primary-foreground hover:brightness-110 transition">
        <Download className="h-4 w-4" /> Download offline key generator
      </a>
    </div>
  );
}

function UnlockCard({ retryAfter }: { retryAfter: number }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [secret, setSecret] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unlock = useUnlockVault();
  const pkOpts = usePasskeyLoginOptions();
  const pkVerify = usePasskeyLoginVerify();
  const [pkErr, setPkErr] = useState<unknown>(null);
  const [until, setUntil] = useState(() => Date.now() + retryAfter * 1000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setUntil(Date.now() + retryAfter * 1000); }, [retryAfter]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  const onRejected = (error: unknown) => {
    setSecret('');
    const headers = (error as { headers?: Headers })?.headers;
    const delay = Number(headers?.get('retry-after') ?? 0);
    if (Number.isFinite(delay) && delay > 0) {
      setUntil(Date.now() + delay * 1000);
      setNow(Date.now());
    }
    void qc.invalidateQueries({ queryKey: getGetVaultSessionQueryKey() });
  };

  const onSession = (s: Session) => {
    setSecret('');
    setCsrfToken(s.csrfToken);
    qc.setQueryData(getGetVaultSessionQueryKey(), s);
  };

  const valid = CREDENTIAL_RE.test(secret);

  const submit = () => {
    if (remaining > 0 || unlock.isPending) return;
    if (!valid) { setLocalErr('Secret must be exactly 219 base64url characters.'); return; }
    setLocalErr(null);
    unlock.mutate({ data: { credential: secret } }, { onSuccess: onSession, onError: onRejected });
  };

  const readFile = (f: File) => {
    setFileName(f.name);
    f.text().then((t) => {
      const v = t.trim();
      setSecret(v);
      setLocalErr(CREDENTIAL_RE.test(v) ? null : `Keyfile content is ${v.length} characters; expected 219 base64url characters.`);
    });
  };

  const passkey = async () => {
    if (remaining > 0) return;
    setPkErr(null);
    try {
      const options = await pkOpts.mutateAsync();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await startAuthentication({ optionsJSON: options as any });
      const s = await pkVerify.mutateAsync({ data: { response: response as unknown as Record<string, unknown> } });
      onSession(s as Session);
    } catch (e) { setPkErr(e); onRejected(e); }
  };

  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-6" data-testid="panel-unlock">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-primary"><KeyRound className="h-3.5 w-3.5" /> present credential</div>
      <div className="mt-4 grid grid-cols-2 rounded-sm border border-sidebar-border p-0.5 font-mono text-[11px] uppercase">
        {(['file', 'paste'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setSecret(''); setFileName(null); setLocalErr(null); }} data-testid={`tab-${m}`}
            className={cn('rounded-[3px] py-1.5 transition-colors', mode === m ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground')}>
            {m === 'file' ? 'Keyfile' : 'Paste secret'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
          data-testid="button-upload-keyfile"
          className={cn('mt-4 flex w-full flex-col items-center gap-2 rounded-sm border border-dashed px-4 py-8 transition-colors', valid ? 'border-ok text-ok' : 'border-sidebar-border text-sidebar-foreground/60 hover:border-sidebar-primary hover:text-sidebar-primary')}
        >
          {fileName ? <FileKey2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
          <span className="font-mono text-xs">{fileName ?? 'Drop keyfile or click to choose'}</span>
          {fileName && <span className="font-mono text-[10px] opacity-70">{secret.length} / 219 chars {valid ? 'valid' : ''}</span>}
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </button>
      ) : (
        <div className="mt-4">
          <Input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="219-character base64url secret" data-testid="input-secret"
            className="h-11 border-sidebar-border bg-sidebar font-mono text-sm text-sidebar-accent-foreground placeholder:text-sidebar-foreground/30" />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-sidebar-foreground/50">
            <span>held in memory only</span><span className={valid ? 'text-ok' : ''}>{secret.length} / 219</span>
          </div>
        </div>
      )}

      {localErr && <div className="mt-3 font-mono text-[11px] text-destructive" data-testid="text-local-error">{localErr}</div>}
      {unlock.isError && <div className="mt-3"><ErrorPanel error={unlock.error} title="Unlock rejected" /></div>}

      {remaining > 0 && <p role="status" data-testid="login-countdown" className="mt-4 font-mono text-sm text-sidebar-primary">
        Login temporarily restricted. Retry in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.
      </p>}
      <p className="mt-3 text-xs text-sidebar-foreground/60">Three invalid keys within an hour restrict this IP for one hour. You can retry after the countdown.</p>
      <Button onClick={submit} disabled={!valid || unlock.isPending || remaining > 0} data-testid="button-unlock"
        className="mt-5 h-11 w-full gap-2 bg-sidebar-primary font-mono text-xs uppercase tracking-wider text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
        <Lock className="h-4 w-4" /> {unlock.isPending ? 'Verifying' : 'Open vault'}
      </Button>

      <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/40"><span className="h-px flex-1 bg-sidebar-border" />or<span className="h-px flex-1 bg-sidebar-border" /></div>
      <button onClick={passkey} disabled={pkOpts.isPending || pkVerify.isPending || remaining > 0} data-testid="button-passkey-login"
        className="flex w-full items-center justify-center gap-2 rounded-sm border border-sidebar-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider hover:border-sidebar-primary hover:text-sidebar-primary transition-colors disabled:opacity-50">
        <Fingerprint className="h-4 w-4" /> {pkOpts.isPending || pkVerify.isPending ? 'Waiting for authenticator' : 'Use enrolled passkey'}
      </button>
      {pkErr != null && <div className="mt-3"><ErrorPanel error={pkErr} title="Passkey sign-in failed" /></div>}
      <p className="mt-5 text-center text-[11.5px] text-sidebar-foreground/45">Lost the keyfile? There is no reset link. Restore from your offline backup. <a href={KEYGEN} className="underline hover:text-sidebar-primary" data-testid="link-keygen-footer">Key generator</a></p>
    </div>
  );
}
