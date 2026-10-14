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

export default function LockScreen({ session }: { session: Session }) {
  return (
    <div className="relative min-h-[100dvh] bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[44dvh] rounded-b-[48px] bg-sidebar" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-10">
        <div className="rise flex flex-col items-center text-center text-[hsl(240_30%_97%)]">
          <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-[hsl(30_92%_54%)] text-[hsl(230_30%_13%)] shadow-lg"><VaultMark className="h-10 w-10" /></span>
          <h1 className="font-display mt-5 text-[2rem] font-extrabold leading-tight">{session.configured ? 'Welcome back' : 'Vault not set up'}</h1>
          <p className="mt-1.5 max-w-xs text-[14px] text-[hsl(235_20%_80%)]">{session.configured ? 'Unlock Strongroom with your keyfile or an enrolled passkey.' : 'An owner has not been installed on this server yet.'}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-[hsl(30_92%_54%/0.18)] px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-[hsl(30_92%_60%)]" data-testid="badge-network">{session.network}{/^(main|mainnet|bitcoin)$/i.test(session.network) ? "" : " · test network"}</span>
            <span className="rounded-full bg-[hsl(232_24%_22%)] px-3 py-1 text-[11.5px] font-semibold">Locked</span>
          </div>
        </div>
        <div className="rise rise-2 mt-7">{session.configured ? <UnlockCard retryAfter={session.loginRetryAfterSeconds ?? 0} /> : <SetupCard />}</div>
        <p className="mt-auto pt-6 text-center text-[11.5px] text-muted-foreground">{session.network === 'main' ? 'Bitcoin mainnet · real funds. Verify network and destination before sending.' : 'Test network only. Do not send real Bitcoin.'}</p>
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
    <div className="rounded-[28px] bg-card p-6 shadow-xl" data-testid="panel-setup">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary"><Terminal className="h-3.5 w-3.5" /> offline setup</div>
      <ol className="mt-5 space-y-4">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-4">
            <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="text-sm font-semibold text-foreground">{s.t}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground/65">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-sm border border-border bg-muted p-3 font-mono text-[11.5px] text-muted-foreground/80">
        <div className="text-muted-foreground/40"># on the server, after receiving the verifier</div>
        <div>VAULT_OWNER_VERIFIER=&lt;verifier from keygen&gt;</div>
        <div className="text-muted-foreground/40"># restart the API, then reload this page</div>
      </div>
      <div className="mt-5 grid gap-2 text-[12.5px] text-muted-foreground/60">
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
    <div className="rounded-[28px] bg-card p-6 shadow-xl" data-testid="panel-unlock">
      <div className="flex items-center gap-2 text-[15px] font-bold text-foreground"><KeyRound className="h-4 w-4 text-primary" /> Unlock</div>
      <div className="mt-4 grid grid-cols-2 rounded-full bg-muted p-1 text-[13px] font-semibold">
        {(['file', 'paste'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setSecret(''); setFileName(null); setLocalErr(null); }} data-testid={`tab-${m}`}
            className={cn('rounded-full py-2 transition-colors', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/60 hover:text-foreground')}>
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
          className={cn('mt-4 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 transition-colors', valid ? 'border-ok text-ok' : 'border-border text-muted-foreground hover:border-primary hover:text-primary')}
        >
          {fileName ? <FileKey2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
          <span className="font-mono text-xs">{fileName ?? 'Drop keyfile or click to choose'}</span>
          {fileName && <span className="font-mono text-[10px] opacity-70">{secret.length} / 86 chars {valid ? 'valid' : ''}</span>}
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </button>
      ) : (
        <div className="mt-4">
          <Input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="86-character base64url secret" data-testid="input-secret"
            className="h-12 rounded-2xl border-border bg-muted font-mono text-sm text-foreground placeholder:text-muted-foreground/30" />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground/50">
            <span>held in memory only</span><span className={valid ? 'text-ok' : ''}>{secret.length} / 86</span>
          </div>
        </div>
      )}

      {localErr && <div className="mt-3 font-mono text-[11px] text-destructive" data-testid="text-local-error">{localErr}</div>}
      {unlock.isError && <div className="mt-3"><ErrorPanel error={unlock.error} title="Unlock rejected" /></div>}

      {remaining > 0 && <p role="status" data-testid="login-countdown" className="mt-4 text-sm text-primary">
        Login temporarily restricted. Retry in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.
      </p>}
      <p className="mt-3 text-xs text-muted-foreground">Three invalid keys within an hour restrict this IP for one hour. You can retry after the countdown.</p>
      <Button onClick={submit} disabled={!valid || unlock.isPending || remaining > 0} data-testid="button-unlock"
        className="mt-5 h-12 w-full gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground hover:bg-primary/90">
        <Lock className="h-4 w-4" /> {unlock.isPending ? 'Verifying' : 'Open vault'}
      </Button>

      <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <button onClick={passkey} disabled={pkOpts.isPending || pkVerify.isPending || remaining > 0} data-testid="button-passkey-login"
        className="flex w-full items-center justify-center gap-2 rounded-full bg-muted px-4 py-3 text-[14px] font-semibold hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
        <Fingerprint className="h-4 w-4" /> {pkOpts.isPending || pkVerify.isPending ? 'Waiting for authenticator' : 'Use enrolled passkey'}
      </button>
      {pkErr != null && <div className="mt-3"><ErrorPanel error={pkErr} title="Passkey sign-in failed" /></div>}
      <p className="mt-5 text-center text-[11.5px] text-muted-foreground">Lost the keyfile? There is no reset link. Restore from your offline backup.</p>
    </div>
  );
}
