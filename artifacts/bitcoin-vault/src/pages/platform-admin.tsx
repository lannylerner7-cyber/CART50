import { useEffect, useState } from 'react';
import { QueryCache, MutationCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { getGetPlatformAdminSessionQueryKey, useGetPlatformAdminSession, loginPlatformAdmin, logoutPlatformAdmin } from '@workspace/api-client-react';
import { VaultMark } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorPanel } from '@/components/kit';
import AdminPage from './admin';
import { errStatus } from '@/lib/vault';

const KEY = getGetPlatformAdminSessionQueryKey();
const EVENT = 'platform-admin-locked';
const closed = { authenticated:false, configured:true, csrfToken:null, expiresAt:null, authenticatedAt:null };
function clear(client: QueryClient, broadcast = false) {
  void client.cancelQueries(); client.clear(); client.setQueryData(KEY, closed);
  if (broadcast) { try { localStorage.setItem(EVENT, crypto.randomUUID()); } catch { /* Optional cross-tab signal. */ } }
}
function Content() {
  const client = useQueryClient();
  const q = useGetPlatformAdminSession({ query: { queryKey:KEY, retry:false, refetchInterval:30_000 } });
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => { document.title = 'Platform admin sign-in · MainVaultWallet'; }, []);
  useEffect(() => {
    const listener = (e:StorageEvent) => { if(e.key===EVENT) clear(client); };
    window.addEventListener('storage',listener); return () => window.removeEventListener('storage',listener);
  },[client]);
  useEffect(() => {
    if (!q.data?.authenticated || !q.data.expiresAt) return;
    const id=setTimeout(()=>clear(client),Math.max(0,Date.parse(q.data.expiresAt)-Date.now()));
    return ()=>clearTimeout(id);
  },[client,q.data?.authenticated,q.data?.expiresAt]);
  useEffect(() => {
    if (q.data && !q.data.authenticated) client.removeQueries({predicate:x=>x.queryKey[0]!==KEY[0]});
  },[client,q.data]);
  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const session=await loginPlatformAdmin({email,password});
      client.clear(); client.setQueryData(KEY,session); setPassword(''); setConfirm(false);
    } catch(e) { setPassword(''); setError(e instanceof Error?e.message:'Sign-in failed'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    if(busy) return; setBusy(true); setError('');
    try { await logoutPlatformAdmin({headers:{'x-csrf-token':q.data?.csrfToken??''}}); clear(client,true); }
    catch(e) { if(errStatus(e)===401) clear(client,true); else setError('Sign-out could not be confirmed. Please retry.'); }
    finally { setBusy(false); }
  };
  if(q.isLoading) return <p role="status" className="p-8">Checking administrator session…</p>;
  if(q.isError) return <div className="mx-auto max-w-lg p-8"><ErrorPanel error={q.error} onRetry={()=>q.refetch()} title="Administrator service unavailable" /></div>;
  if(q.data?.authenticated && !confirm) return <>
    {error&&<p role="alert" className="p-4 text-destructive">{error}</p>}
    <AdminPage adminSession={q.data} onAuthenticate={()=>{setConfirm(true);setError('');}} onLogout={logout} />
  </>;
  return <main className="grid min-h-dvh place-items-center bg-background px-5 py-12">
    <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-9">
      <div className="mb-8 flex items-center gap-3"><VaultMark className="h-10 w-10"/><div><strong>MainVaultWallet</strong><p className="text-xs uppercase tracking-widest text-muted-foreground">Platform administration</p></div></div>
      <h1 className="text-2xl font-semibold">{confirm?'Confirm your identity':'Administrator sign-in'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{confirm?'Re-enter your credentials to authorize administrative changes for five minutes.':'Sign in to manage developer accounts and platform operations.'}</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div className="space-y-2"><Label htmlFor="admin-email">Email</Label><Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="admin-password">Password</Label><Input id="admin-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} /></div>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        {q.data?.configured===false&&<p role="alert" className="text-sm text-muted-foreground">Administrator sign-in has not been configured on this server.</p>}
        <Button className="w-full rounded-full" disabled={busy||q.data?.configured===false}>{busy?'Signing in…':confirm?'Confirm identity':'Sign in'}</Button>
        {confirm&&<Button type="button" variant="outline" className="w-full" onClick={()=>{setPassword('');setConfirm(false);}}>Cancel</Button>}
      </form>
      <p className="mt-6 text-xs text-muted-foreground">This login does not unlock your personal vault.</p>
    </section>
  </main>;
}
export default function PlatformAdmin() {
  const [client] = useState(()=>{
    const onError=(e:unknown)=>{if(errStatus(e)===401) clear(c);};
    const c=new QueryClient({queryCache:new QueryCache({onError}),mutationCache:new MutationCache({onError}),defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    return c;
  });
  return <QueryClientProvider client={client}><Content/></QueryClientProvider>;
}
