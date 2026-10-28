import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { useGetDeveloperSession, type DeveloperSession } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { ErrorPanel } from '@/components/kit';
import { VaultMark } from '@/components/shell';
import { SandboxShell } from '@/components/sandbox-shell';
import { SandboxAdapterProvider } from '@/lib/sandbox-adapter';
import { DEV_END_EVENT, DEV_SESSION_KEY, DevProvider, devQueryClient, endDeveloper, nextStep, useDev, useDeveloperAdapter } from '@/lib/developer';
import { Apply, Landing, Register } from '@/pages/developers/apply';
import { KeyPage, Passkey, Provision, Verify } from '@/pages/developers/onboarding';
import { Live, Login } from '@/pages/developers/access';
import NotFound from '@/pages/not-found';
import { DeveloperIntroGate } from '@/components/developer-intro';

// In-memory only: plays once per page load on first arrival at an entry page.
let introSeen = false;
const ENTRY = ['/', '/login', '/apply'];

const SandboxRouter = lazy(() => import('@/pages/sandbox'));

/** Minimal preconditions; each page renders its own completed state instead of bouncing. */
function Need({ when, children }: { when: (s: DeveloperSession) => boolean; children: ReactNode }) {
  const { session } = useDev();
  if (!session.authenticated) return <Redirect to="/login" />;
  if (!when(session)) return <Redirect to={nextStep(session)} />;
  return <>{children}</>;
}

function DevSandbox() {
  const adapter = useDeveloperAdapter();
  const { session } = useDev();
  const [loc] = useLocation();
  return (
    <SandboxAdapterProvider adapter={adapter}>
      <SandboxShell>
        <ErrorBoundary resetKey={loc}>
          <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading sandbox</p>}>
            {/* Remount per identity so no rendered snapshot survives an account switch. */}
            <div key={session.id}><SandboxRouter /></div>
          </Suspense>
        </ErrorBoundary>
      </SandboxShell>
    </SandboxAdapterProvider>
  );
}

const full = (s: DeveloperSession) => !!s.ready && !!s.keyIssued;

function Routes() {
  const { session, email } = useDev();
  const [loc] = useLocation();
  if (loc === '/sandbox' || loc.startsWith('/sandbox/')) return <Need when={full}><DevSandbox /></Need>;
  return (
    <ErrorBoundary resetKey={loc}>
      <Switch>
        <Route path="/"><Landing /></Route>
        <Route path="/apply" component={Apply} />
        <Route path="/register" component={Register} />
        <Route path="/verify"><Verify /></Route>
        <Route path="/passkey"><Need when={(s) => !!s.verified}><Passkey /></Need></Route>
        <Route path="/provision"><Need when={(s) => !!s.passkeyEnrolled}><Provision /></Need></Route>
        <Route path="/key"><Need when={(s) => !!s.ready}><KeyPage /></Need></Route>
        <Route path="/login" component={Login} />
        <Route path="/live"><Need when={(s) => !!s.passkeyEnrolled}><Live /></Need></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function DevGate({ atRoot = false }: { atRoot?: boolean }) {
  const s = useGetDeveloperSession({ query: { queryKey: DEV_SESSION_KEY, refetchInterval: 30000 } });
  const session = s.data;
  const [email, setEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState<string | null>(null);
  const [freshAt, setFreshAt] = useState(0);
  const [loc] = useLocation();
  const [showIntro, setShowIntro] = useState(() => !introSeen && ENTRY.includes(loc));
  const authed = !!session?.authenticated;
  const id = session?.id;
  const previousId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if(previousId.current && previousId.current!==id) {setEmail('');setAcceptedTerms(null);setFreshAt(0);}
    previousId.current=id;
  },[id]);

  useEffect(() => {
    const l = (e: StorageEvent) => { if (e.key === DEV_END_EVENT && e.newValue) endDeveloper(devQueryClient, false); };
    window.addEventListener('storage', l);
    return () => window.removeEventListener('storage', l);
  }, []);
  useEffect(() => {
    if (!authed || !session?.expiresAt) return;
    const ms = Date.parse(session.expiresAt) - Date.now();
    const t = setTimeout(() => endDeveloper(devQueryClient), Number.isFinite(ms) ? Math.max(0, ms) : 0);
    return () => clearTimeout(t);
  }, [authed, session?.expiresAt]);
  // On logout/expiry or identity change: drop all developer data and in-memory secrets.
  useEffect(() => {
    if (!authed) {
      void devQueryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== DEV_SESSION_KEY[0] });
      devQueryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== DEV_SESSION_KEY[0] });
      setFreshAt(0);
    }
  }, [authed]);
  useEffect(() => {
    devQueryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'developer' && q.queryKey[1] !== id });
    setFreshAt((f) => (id ? f : 0));
  }, [id]);

  const value = useMemo(() => session ? { session, email, setEmail, acceptedTerms, setAcceptedTerms, freshAt, setFreshAt } : null, [session, email, acceptedTerms, freshAt]);

  if (s.isLoading) {
    return <div className="grid min-h-[100dvh] place-items-center bg-sidebar text-sidebar-foreground"><div className="flex flex-col items-center gap-3"><VaultMark className="h-12 w-12" /><span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-60">opening developer access</span></div></div>;
  }
  if (!value) {
    return <div className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="w-full max-w-md"><ErrorPanel error={s.error} onRetry={() => s.refetch()} title="Developer service unreachable" /></div></div>;
  }
  return <DevProvider value={value}>{atRoot ? <Landing prefix="/developers" /> : <Routes />}{showIntro && <DeveloperIntroGate onDone={() => { introSeen = true; setShowIntro(false); }} />}</DevProvider>;
}

/** Mounted under /developers with its own QueryClient: owner session, CSRF and caches are never touched. */
export default function DevelopersApp({ atRoot = false }: { atRoot?: boolean }) {
  return (
    <QueryClientProvider client={devQueryClient}>
      {atRoot ? <DevGate atRoot /> : <Route path="/developers" nest><DevGate /></Route>}
    </QueryClientProvider>
  );
}
