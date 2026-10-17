import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startAuthentication } from '@simplewebauthn/browser';
import { FileKey2, Fingerprint, KeyRound, Lock, ShieldOff, Terminal, Upload } from 'lucide-react';
import { getGetVaultSessionQueryKey, setCsrfToken, useUnlockVault, usePasskeyLoginOptions, usePasskeyLoginVerify, type Session } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorPanel } from '@/components/kit';
import { VaultMark } from '@/components/shell';
import { CREDENTIAL_RE } from '@/lib/vault';
import { cn } from '@/lib/utils';
import { LoginBitcoinHero } from '@/components/login-bitcoin-hero';

export default function LockScreen({ session }: { session: Session }) {
  const isMain = /^(main|mainnet|bitcoin)$/i.test(session.network);
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.16),transparent_65%)] lg:left-[28%]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.10),transparent_65%)]" />
      <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl grid-cols-1 gap-8 px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] lg:grid-cols-[1fr_440px] lg:items-center lg:gap-16 lg:px-10">
        <header className="rise flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-accent text-accent-foreground shadow-[0_12px_32px_-12px_hsl(var(--accent)/0.6)]"><VaultMark className="h-8 w-8" /></span>
            <span className="font-display text-[19px] font-bold tracking-tight text-foreground">Strongroom</span>
          </div>
          <h1 className="font-display mt-7 text-[2.1rem] font-extrabold leading-[1.05] text-foreground sm:text-[2.6rem] lg:text-[3.4rem]">{session.configured ? <>Welcome<br className="hidden lg:block" /> back</> : 'Vault not set up'}</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{session.configured ? 'Unlock Strongroom with your keyfile or an enrolled passkey.' : 'An owner has not been installed on this server yet.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground" data-testid="badge-network"><span className={cn('h-1.5 w-1.5 rounded-full', isMain ? 'bg-accent' : 'bg-warn')} />{session.network}{isMain ? '' : ' · test network'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> Locked</span>
          </div>
          <LoginBitcoinHero />
          <p className="mt-8 hidden max-w-sm text-[12.5px] leading-relaxed text-muted-foreground lg:block">{session.network === 'main' ? 'Bitcoin mainnet · real funds. Verify network and destination before sending.' : 'Test network only. Do not send real Bitcoin.'}</p>
        </header>
        <main className="rise rise-2 w-full max-w-md justify-self-center lg:max-w-none">{session.configured ? <UnlockCard retryAfter={session.loginRetryAfterSeconds ?? 0} /> : <SetupCard />}</main>
        <p className="mt-auto text-center text-[11.5px] text-muted-foreground lg:hidden">{session.network === 'main' ? 'Bitcoin mainnet · real funds. Verify network and destination before sending.' : 'Test network only. Do not send real Bitcoin.'}</p>
      </div>
    </div>
  );
}

function SetupCard() {
  const steps = [
    { t: 'Go offline', d: 'Use your saved offline generator on an air-gapped machine with networking disconnected.' },
    { t: 'Generate the secret', d: 'Use your offline generator. It draws 64 random bytes and emits an 86-character base64url keyfile plus its verifier.' },
    { t: 'Store the keyfile', d: 'Save the keyfile to removable media. Keep at least two copies in separate physical locations.' },
    { t: 'Install the verifier', d: 'Hand only the verifier (never the secret) to the server operator, who sets it in the server environment and restarts.' },
  ];
  return (
    <div className="rounded-[28px] border border-border bg-card p-5 shadow-2xl sm:p-7" data-testid="panel-setup">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-accent"><Terminal className="h-3.5 w-3.5" /> offline setup</div>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="text-sm font-semibold text-foreground">{s.t}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-background p-3.5 font-mono text-[11.5px] text-muted-foreground/80">
        <div className="text-muted-foreground/40"># on the server, after receiving the verifier</div>
        <div>VAULT_OWNER_VERIFIER=&lt;verifier from keygen&gt;</div>
        <div className="text-muted-foreground/40"># restart the API, then reload this page</div>
      </div>
      <div className="mt-5 grid gap-2 text-[12.5px] text-muted-foreground">
        <div className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Setup sends only the verifier to the server. Unlocking later sends the credential over HTTPS; protect your device and check the site address.</div>
        <div className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> No protected data is requested while unconfigured. Nothing you see here is fabricated.</div>
      </div>
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
  const [until, setUntil] = useState(() => retryAfter > 0 ? Date.now() + retryAfter * 1000 : 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setUntil(retryAfter > 0 ? Date.now() + retryAfter * 1000 : 0); }, [retryAfter]);
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
    if (!valid) { setLocalErr('Secret must be exactly 86 base64url characters.'); return; }
    setLocalErr(null);
    unlock.mutate({ data: { credential: secret } }, { onSuccess: onSession, onError: onRejected });
  };

  const readFile = (f: File) => {
    setFileName(f.name);
    f.text().then((t) => {
      const v = t.trim();
      setSecret(v);
      setLocalErr(CREDENTIAL_RE.test(v) ? null : `Keyfile content is ${v.length} characters; expected 86 base64url characters.`);
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
    <div className="rounded-[28px] border border-border bg-card p-5 shadow-2xl sm:p-7" data-testid="panel-unlock">
      <h2 className="flex items-center gap-2.5 text-[17px] font-bold text-foreground"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15"><KeyRound className="h-4 w-4 text-primary" aria-hidden /></span> Unlock your vault</h2>
      <div role="tablist" aria-label="Unlock method" className="mt-5 grid grid-cols-2 rounded-full border border-border bg-background p-1 text-[13.5px] font-semibold">
        {(['file', 'paste'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setSecret(''); setFileName(null); setLocalErr(null); }} data-testid={`tab-${m}`}
            className={cn('min-h-10 rounded-full py-2 transition-colors', mode === m ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {m === 'file' ? 'Keyfile' : 'Paste secret'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <button
          type="button"
          aria-label={fileName ? `Keyfile ${fileName} selected, choose another` : 'Choose keyfile'}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
          data-testid="button-upload-keyfile"
          className={cn('mt-4 flex w-full flex-col items-center gap-2.5 rounded-3xl border-2 border-dashed px-4 py-8 transition-colors', valid ? 'border-ok/70 bg-ok/5 text-ok' : fileName ? 'border-destructive/60 text-destructive' : 'border-border bg-background/40 text-muted-foreground hover:border-primary hover:text-primary')}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">{fileName ? <FileKey2 className="h-5 w-5" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}</span>
          <span className="max-w-full truncate text-[14px] font-semibold">{fileName ?? 'Drop keyfile or tap to choose'}</span>
          {fileName && <span className="font-mono text-[10px] opacity-70">{secret.length} / 86 chars {valid ? 'valid' : ''}</span>}
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </button>
      ) : (
        <div className="mt-4">
          <label htmlFor="input-secret" className="sr-only">Secret</label>
          <Input id="input-secret" aria-invalid={secret.length > 0 && !valid} type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="86-character base64url secret" data-testid="input-secret"
            className="h-13 rounded-2xl border-border bg-background px-4 font-mono text-sm text-foreground placeholder:text-muted-foreground/30" />
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-muted-foreground">
            <span>held in memory only</span><span className={valid ? 'text-ok' : ''}>{secret.length} / 86</span>
          </div>
        </div>
      )}

      {localErr && <div role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[12.5px] text-destructive" data-testid="text-local-error">{localErr}</div>}
      {unlock.isError && <div className="mt-3"><ErrorPanel error={unlock.error} title="Unlock rejected" /></div>}

      {remaining > 0 && <p role="status" data-testid="login-countdown" className="mt-4 rounded-2xl bg-accent/10 px-3.5 py-2.5 text-sm font-semibold text-accent">
        Login temporarily restricted. Retry in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.
      </p>}
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">Three invalid keys within an hour restrict this IP for one hour. You can retry after the countdown.</p>
      <Button onClick={submit} disabled={!valid || unlock.isPending || remaining > 0} data-testid="button-unlock"
        className="mt-5 h-13 w-full gap-2 rounded-full bg-primary text-[15.5px] font-bold disabled:opacity-40 text-primary-foreground hover:bg-primary/90">
        <Lock className="h-4 w-4" /> {unlock.isPending ? 'Verifying' : 'Open vault'}
      </Button>

      <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <button type="button" onClick={passkey} disabled={pkOpts.isPending || pkVerify.isPending || remaining > 0} data-testid="button-passkey-login"
        className="flex w-full items-center justify-center gap-2 min-h-12 rounded-full border border-border bg-background px-4 py-3 text-[14.5px] font-semibold transition-colors hover:bg-muted disabled:opacity-50">
        <Fingerprint className="h-4 w-4 text-primary" aria-hidden /> {pkOpts.isPending || pkVerify.isPending ? 'Waiting for authenticator' : 'Use enrolled passkey'}
      </button>
      {pkErr != null && <div className="mt-3"><ErrorPanel error={pkErr} title="Passkey sign-in failed" /></div>}
      <p className="mt-5 rounded-2xl bg-muted/60 px-4 py-3 text-center text-[12px] text-muted-foreground">Lost the keyfile? There is no reset link. Restore from your offline backup.</p>
    </div>
  );
}
