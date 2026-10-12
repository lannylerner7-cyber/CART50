import { useEffect, type ReactNode } from 'react';
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
import Overview from '@/pages/overview';
import Wallets from '@/pages/wallets';
import WalletDetail from '@/pages/wallet-detail';
import Transactions from '@/pages/transactions';
import Spending from '@/pages/spending';
import Explorer from '@/pages/explorer';
import Market from '@/pages/market';
import SettingsPage from '@/pages/settings';

const SESSION_KEY = getGetVaultSessionQueryKey();
const on401 = (e: unknown) => {
  if (errStatus(e) === 401) queryClient.invalidateQueries({ queryKey: SESSION_KEY });
};
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: on401 }),
  mutationCache: new MutationCache({ onError: on401 }),
  defaultOptions: { queries: { retry: (n, e) => errStatus(e) !== 401 && errStatus(e) !== 403 && n < 1, refetchOnWindowFocus: false } },
});

function Router() {
  return (
    <RoutedErrorBoundary>
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
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Gate() {
  const s = useGetVaultSession({ query: { queryKey: SESSION_KEY, refetchInterval: 30000 } });
  const session = s.data;
  const authed = !!session?.authenticated;
  const token = session?.csrfToken ?? null;

  useEffect(() => {
    setCsrfToken(authed ? token : null);
  }, [authed, token]);

  useEffect(() => {
    if (session && !session.authenticated) {
      // Drop any protected data left in cache after expiry or lock.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
    }
  }, [session]);

  if (s.isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col items-center gap-3"><VaultMark className="dial h-12 w-12" /><span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-60">checking the door</span></div>
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
      <Shell><Router /></Shell>
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
