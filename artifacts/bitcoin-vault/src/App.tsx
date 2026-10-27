import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetVaultSession, getGetVaultSessionQueryKey, setCsrfToken } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Shell, VaultMark } from '@/components/shell';
import { ErrorPanel } from '@/components/kit';
import { SessionProvider, errStatus } from '@/lib/vault';
import LockScreen from '@/pages/lock';
const Overview = lazy(() => import('@/pages/overview'));
const Wallets = lazy(() => import('@/pages/wallets'));
const WalletDetail = lazy(() => import('@/pages/wallet-detail'));
const Transactions = lazy(() => import('@/pages/transactions'));
const Spending = lazy(() => import('@/pages/spending'));
const Explorer = lazy(() => import('@/pages/explorer'));
const Market = lazy(() => import('@/pages/market'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const SandboxRouter = lazy(() => import('@/pages/sandbox'));
import { SandboxShell } from '@/components/sandbox-shell';
import { lockClient, LOCK_EVENT } from '@/lib/session-lock';
import { retryRead, readRetryDelay, transientReadError } from '@/lib/request-recovery';

const SESSION_KEY = getGetVaultSessionQueryKey();
const on401 = (e: unknown) => {
  if (errStatus(e) === 401 && queryClient.getQueryData<{ authenticated: boolean }>(SESSION_KEY)?.authenticated) lockClient(queryClient);
};
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: on401 }),
  mutationCache: new MutationCache({ onError: on401 }),
  defaultOptions: {
    queries: {
      retry: retryRead,
      retryDelay: readRetryDelay,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: (q) => q.state.status === 'error' && transientReadError(q.state.error) ? 30000 : false,
    },
    mutations: { retry: false },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading page…</p>}>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/wallets" component={Wallets} />
        <Route path="/wallets/:id" component={WalletDetail} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/spending" component={Spending} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/market" component={Market} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Gate() {
  const [location] = useLocation();
  const s = useGetVaultSession({ query: { queryKey: SESSION_KEY, refetchInterval: 30000, refetchOnWindowFocus: true, refetchOnReconnect: true } });
  const session = s.data;
  const authed = !!session?.authenticated;
  const token = session?.csrfToken ?? null;

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === LOCK_EVENT && event.newValue) lockClient(queryClient, false);
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);

  useEffect(() => {
    if (!authed || !session?.expiresAt) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = setTimeout(() => lockClient(queryClient), Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
    return () => clearTimeout(timer);
  }, [authed, session?.expiresAt]);

  useEffect(() => {
    setCsrfToken(authed ? token : null);
  }, [authed, token]);

  useEffect(() => {
    if (session && !session.authenticated) {
      // Drop any protected data left in cache after expiry or lock.
      void queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
    }
  }, [session]);

  if (s.isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col items-center gap-3"><VaultMark className="h-12 w-12" /><span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-60">checking the door</span></div>
      </div>
    );
  }
  if (s.isError || !session) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-6">
        <div className="w-full max-w-md"><ErrorPanel error={s.error} onRetry={() => s.refetch()} title="Vault server unreachable" /></div>
      </div>
    );
  }
  if (!session.authenticated) return <LockScreen session={session} />;

  return (
    <SessionProvider session={session}>
      {location === '/sandbox' || location.startsWith('/sandbox/') ? (
        <SandboxShell>
          <RoutedErrorBoundary>
            <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading sandbox…</p>}><SandboxRouter /></Suspense>
          </RoutedErrorBoundary>
        </SandboxShell>
      ) : <Shell><Router /></Shell>}
    </SessionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
