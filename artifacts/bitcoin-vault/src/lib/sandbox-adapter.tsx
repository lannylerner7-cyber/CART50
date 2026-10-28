import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { QueryClient, QueryKey, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import {
  useGetSandbox, getSandbox, getGetSandboxQueryKey, useGetSandboxAddress, getGetSandboxAddressQueryKey,
  useReviewSandboxPayment, useExecuteSandboxPayment,
  type SandboxSnapshot, type SandboxAddressInfo, type SandboxReview, type SandboxReceipt,
  type SandboxReviewInput, type SandboxExecuteInput,
} from '@workspace/api-client-react';
import { useCsrf, useSession } from '@/lib/vault';
import SignetPage, { SignetSummary, useSignet } from '@/pages/sandbox/signet';

/**
 * Scoped data adapter for the shared Sandbox screens. The owner adapter is the
 * default and keeps the original owner behaviour. Developer routes inject their
 * own adapter so the same screens never touch owner APIs or owner caches.
 */
export type SnapshotQuery = UseQueryResult<SandboxSnapshot, unknown>;
export type ReviewMutation = UseMutationResult<SandboxReview, unknown, { data: SandboxReviewInput }, unknown>;
export type ExecMutation = UseMutationResult<SandboxReceipt, unknown, { data: SandboxExecuteInput }, unknown>;

export interface SandboxAdapter {
  kind: 'owner' | 'developer';
  snapshotKey: () => QueryKey;
  useSnapshot: () => SnapshotQuery;
  fetchSnapshot: (qc: QueryClient) => Promise<SandboxSnapshot | null>;
  useAddress: (destination: string) => UseQueryResult<SandboxAddressInfo, unknown>;
  invalidateAddresses: (qc: QueryClient) => void;
  useReview: () => ReviewMutation;
  useExec: () => ExecMutation;
  useExpiresAt: () => string | null | undefined;
  useSignetState: () => { label: string; tone: 'ok' | 'bad' | 'neutral' };
  SignetSummary: ComponentType;
  SignetPage: ComponentType;
  /** Optional extra valuation lines rendered beneath the simulated balance. */
  BalanceExtra?: ComponentType<{ d: SandboxSnapshot }>;
  returnHref: string;
}

const OWNER_KEY = getGetSandboxQueryKey();

export const ownerSandboxAdapter: SandboxAdapter = {
  kind: 'owner',
  snapshotKey: () => OWNER_KEY,
  useSnapshot: () => useGetSandbox({ query: { queryKey: OWNER_KEY, refetchInterval: 30000 } }) as unknown as SnapshotQuery,
  fetchSnapshot: (qc) => qc.fetchQuery({ queryKey: OWNER_KEY, queryFn: () => getSandbox() }).catch(() => null),
  useAddress: (lookup) => useGetSandboxAddress({ destination: lookup }, { query: { enabled: lookup.length > 0, queryKey: getGetSandboxAddressQueryKey({ destination: lookup }), retry: false } }) as unknown as UseQueryResult<SandboxAddressInfo, unknown>,
  invalidateAddresses: (qc) => { void qc.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).startsWith('/api/vault/sandbox/address') }); },
  useReview: () => useReviewSandboxPayment(useCsrf()) as ReviewMutation,
  useExec: () => useExecuteSandboxPayment(useCsrf()) as ExecMutation,
  useExpiresAt: () => useSession().expiresAt,
  useSignetState: () => {
    const sg = useSignet();
    return {
      tone: sg.isError ? 'bad' : sg.data?.available ? 'ok' : 'neutral',
      label: sg.isLoading ? 'checking' : sg.isError ? 'unreachable' : sg.data?.available ? 'available' : 'setup required',
    };
  },
  SignetSummary,
  SignetPage,
  returnHref: '/',
};

const Ctx = createContext<SandboxAdapter>(ownerSandboxAdapter);

export function SandboxAdapterProvider({ adapter, children }: { adapter: SandboxAdapter; children: ReactNode }) {
  return <Ctx.Provider value={adapter}>{children}</Ctx.Provider>;
}

export function useSandboxAdapter(): SandboxAdapter {
  return useContext(Ctx);
}
