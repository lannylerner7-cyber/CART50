import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import {
  developerAction, getGetDeveloperSessionQueryKey, getDeveloperSandbox, useGetDeveloperSandbox, useGetDeveloperSandboxAddress,
  type DeveloperActionInput, type DeveloperActionResult, type DeveloperSandbox, type DeveloperSession,
  type SandboxReceipt, type SandboxReview, type SandboxAddressInfo, type SandboxReviewInput, type SandboxExecuteInput, type SandboxSnapshot,
} from '@workspace/api-client-react';
import { errStatus, satsToBtc, stamp } from '@/lib/vault';
import { SandboxCard, SandboxHeader } from '@/components/sandbox-kit';
import { Pill } from '@/components/kit';
import type { SandboxAdapter, SnapshotQuery, ReviewMutation, ExecMutation } from '@/lib/sandbox-adapter';
import { retryRead, readRetryDelay } from '@/lib/request-recovery';

export type DevAction = Parameters<typeof developerAction>[0];
export const DEV_SESSION_KEY = getGetDeveloperSessionQueryKey();
export const DEV_END_EVENT = 'developer-session-ended';
export const DEV_KEY_RE = /^[A-Za-z0-9_-]{86}$/;
export const EMAIL_KEY_RE = /^[A-Za-z0-9_-]{24}$/;
export const ROTATE_WINDOW_MS = 5 * 60 * 1000;

/** Drop every developer query, mutation and rendered snapshot. Owner caches live in a different client. */
export function endDeveloper(client: QueryClient, broadcast = true) {
  const prev = client.getQueryData<DeveloperSession>(DEV_SESSION_KEY);
  void client.cancelQueries();
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== DEV_SESSION_KEY[0] });
  client.getMutationCache().clear();
  if (prev) client.setQueryData<DeveloperSession>(DEV_SESSION_KEY, { authenticated: false, terms: prev.terms });
  void client.invalidateQueries({ queryKey: DEV_SESSION_KEY });
  if (broadcast) {
    try { localStorage.setItem(DEV_END_EVENT, crypto.randomUUID()); } catch { /* storage disabled */ }
  }
}

const on401 = (e: unknown) => {
  if (errStatus(e) === 401 && devQueryClient.getQueryData<DeveloperSession>(DEV_SESSION_KEY)?.authenticated) endDeveloper(devQueryClient);
};

export const devQueryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: on401 }),
  mutationCache: new MutationCache({ onError: on401 }),
  defaultOptions: {
    queries: { retry: retryRead, retryDelay: readRetryDelay, refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false },
  },
});

/* ---------- Context: session + in-memory onboarding state (never URL or storage) ---------- */
export interface DevState {
  session: DeveloperSession;
  email: string;
  setEmail: (v: string) => void;
  acceptedTerms: string | null;
  setAcceptedTerms: (v: string | null) => void;
  freshAt: number;
  setFreshAt: (v: number) => void;
}
const DevCtx = createContext<DevState | null>(null);
export function DevProvider({ value, children }: { value: DevState; children: ReactNode }) {
  return <DevCtx.Provider value={value}>{children}</DevCtx.Provider>;
}
export function useDev(): DevState {
  const v = useContext(DevCtx);
  if (!v) throw new Error('Developer context missing');
  return v;
}

/** Where an authenticated developer must go next. */
export function nextStep(s: DeveloperSession): string {
  if (!s.authenticated) return '/login';
  if (!s.verified) return '/verify';
  if (!s.passkeyEnrolled) return '/passkey';
  if (!s.ready) return '/provision';
  if (!s.keyIssued) return '/key';
  return '/sandbox';
}

export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.refetchQueries({ queryKey: DEV_SESSION_KEY });
}

/** One-shot developer write. Never retried automatically; CSRF only from the developer session. */
export function useDevAction<T = DeveloperActionResult>() {
  const { session } = useDev();
  const token = session.authenticated ? session.csrfToken ?? '' : '';
  return useMutation<T, unknown, { action: DevAction; data?: DeveloperActionInput }>({
    mutationFn: ({ action, data }) =>
      developerAction(action, data ?? {}, token ? { headers: { 'x-developer-csrf': token } } : undefined) as Promise<T>,
    retry: false,
    gcTime: 0,
  });
}

export function devErr(e: unknown, fallback = 'Request failed'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function webAuthnErr(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out. Nothing was saved. Try again when ready.';
  if (name === 'InvalidStateError') return 'This device already holds a passkey for this account. Use it to sign in instead.';
  if (name === 'SecurityError') return 'The browser refused the passkey request for this site. Open the app on its normal address over HTTPS.';
  return devErr(e, 'Passkey request failed.');
}

/* ---------- Developer Sandbox adapter ---------- */
function usdRefCents(sats: number, priceCents: number) {
  return Number(BigInt(sats) * BigInt(priceCents) / 100000000n);
}
function usd(cents: number) {
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

function DevBalanceExtra({ d }: { d: SandboxSnapshot }) {
  const x = d as DeveloperSandbox;
  if (typeof x.simulatedBalanceSats !== 'number') return null;
  const q = x.quote;
  return (
    <div className="mt-3 grid gap-1 rounded-2xl bg-muted/60 p-3 text-[12.5px]" data-testid="card-dev-valuation">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Simulated BTC</span>
        <span className="font-mono font-semibold" data-testid="text-dev-btc">{satsToBtc(String(x.simulatedBalanceSats))} BTC</span>
      </div>
      {q && q.priceCents > 0 ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Pinned USD basis</span>
          <span className="font-mono" data-testid="text-dev-usd-ref">{usd(usdRefCents(x.simulatedBalanceSats, q.priceCents))}</span>
        </div>
      ) : <div className="text-muted-foreground">USD reference unavailable: no quote recorded.</div>}
      {(() => {
        const cv = (x as DeveloperSandbox & { currentValuation?: { amountCents: number; at: string; source: string } | null }).currentValuation;
        return cv ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/60 pt-1" data-testid="text-dev-current-valuation">
            <span className="text-muted-foreground">Current reference</span>
            <span className="font-mono">{usd(cv.amountCents)} <span className="text-[11px] text-muted-foreground">({cv.source}, {stamp(cv.at)})</span></span>
          </div>
        ) : <div className="text-[11.5px] text-muted-foreground" data-testid="text-dev-current-unavailable">Current reference valuation unavailable: no fresh quote.</div>;
      })()}
      {q && <div className="text-[11.5px] text-muted-foreground" data-testid="text-dev-quote">Quote {usd(q.priceCents)} per BTC from {q.source}, pinned {stamp(q.at)} at provisioning. Not a live price.</div>}
      <div className="text-[11.5px] text-muted-foreground">Simulation only. Not real Bitcoin, not withdrawable, no Signet coins.</div>
    </div>
  );
}

function DevSignetSummary() {
  return (
    <SandboxCard title="Signet" meta="Test network" testId="card-signet">
      <div className="flex items-start gap-3 text-[14px] text-muted-foreground"><Ban className="mt-0.5 h-4 w-4 shrink-0" /><p data-testid="text-dev-signet">Unavailable for developer accounts. Developer Sandbox runs on its own simulation ledger with no Signet wallet.</p></div>
    </SandboxCard>
  );
}

function DevSignetPage() {
  return (
    <div className="space-y-5">
      <SandboxHeader kicker="Developer Sandbox" title="Signet" desc="On-chain test network access is not part of developer accounts yet." />
      <SandboxCard title="Unavailable" meta={<Pill>not enabled</Pill>} testId="card-signet-setup">
        <p className="text-[14px] text-muted-foreground">No Signet node is queried for developer sessions, and no balance or address is shown. Your simulated balance is separate and unaffected.</p>
      </SandboxCard>
    </div>
  );
}

export function useDeveloperAdapter(): SandboxAdapter {
  const { session } = useDev();
  const id = session.id ?? 'anon';
  return useMemo<SandboxAdapter>(() => {
    const snapKey = ['developer', id, '/api/developers/sandbox'] as const;
    const headers = () => {
      const t = devQueryClient.getQueryData<DeveloperSession>(DEV_SESSION_KEY)?.csrfToken ?? '';
      return { headers: { 'x-developer-csrf': t } };
    };
    return {
      kind: 'developer',
      snapshotKey: () => snapKey,
      useSnapshot: () => useGetDeveloperSandbox({ query: { queryKey: snapKey, refetchInterval: 30000 } }) as unknown as SnapshotQuery,
      fetchSnapshot: (qc) => qc.fetchQuery({ queryKey: snapKey, queryFn: () => getDeveloperSandbox() }).catch(() => null),
      useAddress: (lookup) => useGetDeveloperSandboxAddress({ destination: lookup }, { query: { enabled: lookup.length > 0, queryKey: ['developer', id, 'address', lookup], retry: false } }) as unknown as UseQueryResult<SandboxAddressInfo, unknown>,
      invalidateAddresses: (qc) => { void qc.invalidateQueries({ queryKey: ['developer', id, 'address'] }); },
      useReview: () => useMutation<SandboxReview, unknown, { data: SandboxReviewInput }>({
        mutationFn: ({ data }) => developerAction('review', { amountCents: data.amountCents, destination: data.destination }, headers()) as unknown as Promise<SandboxReview>,
        retry: false,
      }) as ReviewMutation,
      useExec: () => useMutation<SandboxReceipt, unknown, { data: SandboxExecuteInput }>({
        mutationFn: ({ data }) => developerAction('pay', { reviewId: data.reviewId, confirmed: true }, headers()) as unknown as Promise<SandboxReceipt>,
        retry: false,
      }) as ExecMutation,
      useExpiresAt: () => useDev().session.expiresAt,
      useSignetState: () => ({ label: 'not available for developers', tone: 'neutral' }),
      SignetSummary: DevSignetSummary,
      SignetPage: DevSignetPage,
      BalanceExtra: DevBalanceExtra,
      returnHref: '/live',
    };
  }, [id]);
}
