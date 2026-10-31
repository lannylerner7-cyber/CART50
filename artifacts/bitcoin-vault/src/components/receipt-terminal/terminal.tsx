import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Lock, Radio, RefreshCw } from 'lucide-react';
import { FEED_DURATION_SEC, paperKinematics, UNAVAILABLE, type ReceiptModel, type ReceiptVariant } from '@/lib/receipt-terminal';
import './receipt-terminal.css';

type Led = 'amber' | 'green' | 'red';
const ledFor = (v: ReceiptVariant): Led => (v === 'order_confirmed' ? 'green' : v === 'payment_failed' ? 'red' : 'amber');

export function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setR(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** One-shot 0..10s timeline; stops and holds. Purely visual, no side effects. */
export function useOneShotTimeline(active: boolean, reduced: boolean): number {
  const [t, setT] = useState(active && !reduced ? 0 : FEED_DURATION_SEC);
  useEffect(() => {
    if (!active || reduced) { setT(FEED_DURATION_SEC); return; }
    let raf = 0; let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const s = Math.min(FEED_DURATION_SEC, (now - start) / 1000);
      setT(s);
      if (s < FEED_DURATION_SEC) raf = requestAnimationFrame(tick);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);
  return t;
}

function Mark({ thermal, size = 18 }: { thermal?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M2.4992 4H11.4997V8.5H6.99947V23.5H11.4997V28H2.4992V4ZM29.5008 4H20.5003V8.5H25.0005V23.5H20.5003V28H29.5008V4Z" fill={thermal ? '#1c1a17' : '#F5F7FA'} />
      <path d="M12.5 12H19.5V22.5H12.5V12ZM12 27H20V30H12V27Z" fill={thermal ? '#3d3830' : '#FF9B38'} />
    </svg>
  );
}

function StatusLed({ color, reduced }: { color: Led; reduced: boolean }) {
  const s = { amber: 'bg-amber-400 shadow-[0_0_10px_2px_rgba(245,158,11,0.6)]', green: 'bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.7)]', red: 'bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.6)]' }[color];
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d0f14] px-2.5 py-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)]" aria-hidden="true">
      <span className="font-mono text-[9px] font-medium tracking-[0.14em] text-slate-400/90">STATUS</span>
      <div className="relative h-2.5 w-6 rounded-full bg-[#07080b] p-0.5"><div className={`h-full w-full rounded-full transition-colors duration-500 ${s} ${color === 'amber' && !reduced ? 'rt-pulse' : ''}`} /></div>
    </div>
  );
}

const ROW = 'flex justify-between gap-2';
function PaperRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={ROW}><span className="shrink-0 text-[#575248]">{k}</span><span className={`min-w-0 break-all text-right text-[#141210] ${bold ? 'font-bold' : 'font-medium'}`}>{v}</span></div>;
}

function Paper({ m, feed, settlePx, feeding }: { m: ReceiptModel; feed: number; settlePx: number; feeding: boolean }) {
  const hidden = (1 - feed) * 97;
  const arch = -3 - feed * 5.5 + (settlePx > 0 ? 1.1 : 0);
  return (
    <div className="pointer-events-none relative mx-auto w-[244px] select-none" aria-hidden="true">
      <div className="relative flex w-full items-end justify-center overflow-hidden px-2 pt-2">
        <div className="rt-paper relative w-full origin-bottom rounded-t-[2px] text-[#1e1c18] will-change-transform" style={{ transform: `translate3d(0, calc(${hidden.toFixed(2)}% + ${settlePx.toFixed(2)}px), 0) rotateX(${arch.toFixed(2)}deg)` }}>
          <div className="-mt-[5px] h-[6px] w-full bg-repeat-x" style={{ backgroundImage: 'radial-gradient(circle at 4px 0px, transparent 3.2px, #f6f3ea 3.5px)', backgroundSize: '8px 6px' }} />
          <div className="px-3.5 pb-3 pt-2 font-mono text-[9.5px] leading-[1.35] tracking-tight">
            <div className="flex flex-col items-center border-b border-dashed border-[#1e1c18]/25 pb-2">
              <div className="flex items-center gap-1.5"><Mark thermal /><span className="font-sans text-[12px] font-bold tracking-tight text-[#1c1a17]">main_vault</span></div>
              <div className="mt-1 text-[10px] font-bold tracking-[0.18em] text-[#181613]">PAYMENT RECEIPT</div>
              <div className="mt-0.5 text-center text-[8px] uppercase tracking-wider text-[#6e675b]">{m.networkLabel}</div>
            </div>
            <div className="mt-2 space-y-[3px] border-b border-dashed border-[#1e1c18]/25 pb-2">
              <PaperRow k="Status" v={m.statusText} bold />
              <PaperRow k={m.orderReferenceLabel} v={m.orderReference} />
              <PaperRow k="Date" v={m.recordedAt} />
              <PaperRow k="Amount" v={m.amount} />
              {m.usd && <PaperRow k="USD est." v={m.usd} />}
              <PaperRow k="Network fee" v={m.fee} />
              <div className="border-t border-dotted border-[#1e1c18]/20 pt-1 text-[10px]"><PaperRow k={m.totalLabel} v={m.total} bold /></div>
            </div>
            <div className="mt-1.5 border-b border-dashed border-[#1e1c18]/25 pb-1.5">
              <div className="text-[8.5px] uppercase tracking-wider text-[#575248]">{m.walletAddressLabel}</div>
              <div className="mt-0.5 break-all text-[8.5px] font-semibold leading-[1.25] text-[#1c1915]">{m.walletAddress}</div>
              {m.nonBitcoinIdentifier && <><div className="mt-1 text-[8.5px] uppercase tracking-wider text-[#575248]">{m.nonBitcoinIdentifier.label}</div><div className="mt-0.5 break-all text-[8.5px] leading-[1.25] text-[#1c1915]">{m.nonBitcoinIdentifier.value}</div></>}
              <div className="mt-1 text-[8.5px] uppercase tracking-wider text-[#575248]">Transaction</div>
              <div className="mt-0.5 break-all text-[8.5px] leading-[1.2] text-[#1c1915]">{m.transactionId}</div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.12em] text-[#2c2822]">
              <span>{m.variant === 'order_confirmed' ? 'Thank you' : 'Not confirmed'}</span>
              <span className="text-[7.5px] font-normal tracking-normal text-[#6e675b]">{m.simulation ? 'NO REAL VALUE' : 'KEEP FOR RECORDS'}</span>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
        </div>
        {feeding && <div className="pointer-events-none absolute inset-x-6 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-orange-400/35 to-transparent blur-[1px]" />}
      </div>
    </div>
  );
}

function Screen({ m, variant, t, feed, reduced }: { m: ReceiptModel; variant: ReceiptVariant | 'preparing'; t: number; feed: number; reduced: boolean }) {
  const led: Led = variant === 'preparing' ? 'amber' : ledFor(variant);
  const tone = led === 'green' ? { c: '#4FC482', b: 'border-[#4FC482]/30', bg: 'bg-[#4FC482]/12' } : led === 'red' ? { c: '#E2554F', b: 'border-[#E2554F]/30', bg: 'bg-[#E2554F]/12' } : { c: '#FF9B38', b: 'border-[#FF9B38]/30', bg: 'bg-[#FF9B38]/12' };
  const Icon = variant === 'order_confirmed' ? Check : variant === 'payment_failed' ? AlertTriangle : variant === 'status_unavailable' ? RefreshCw : variant === 'transfer_submitted' ? Radio : Clock;
  const headline = variant === 'preparing' ? 'Preparing receipt' : m.headline;
  const sub = variant === 'preparing' ? 'Formatting recorded settlement' : variant === 'order_confirmed' ? (reduced || t >= 8.5 ? 'Receipt printed · tear above' : t >= 3 ? `Printing thermal receipt (${Math.round(feed * 100)}%)` : 'Verified · engaging platen roller') : m.subline;
  const recTime = m.recordedAt === UNAVAILABLE ? 'NO TIME' : m.recordedAt.split(' ')[1] ?? 'REC';
  return (
    <div className="relative rounded-[14px] border border-[#2a2f3b]/70 bg-[#050609] p-[4px] shadow-[inset_0_3px_9px_rgba(0,0,0,0.98),0_1px_0_rgba(255,255,255,0.12)]" style={{ transform: 'rotateX(2.5deg)' }}>
      <div className="relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-gradient-to-b from-[#0c0f16] via-[#080a0f] to-[#06070b] px-3 py-2.5">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-44 -translate-x-1/2 rounded-full blur-2xl" style={{ background: `${tone.c}22` }} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.012)_30%,transparent_46%)]" />
        <div className="relative z-10 mb-2 flex items-center justify-between border-b border-white/[0.08] pb-1.5 font-mono text-[9.5px]">
          <div className="flex items-center gap-1.5"><Mark size={12} /><span className="font-sans text-[10px] font-bold tracking-tight text-[#F5F7FA]">main_vault</span><span className="text-slate-600">·</span><span className="text-[8.5px] tracking-wider text-slate-400">{m.simulation ? 'SIM' : 'POS'}</span></div>
          <div className="flex items-center gap-1.5"><Lock className="h-2.5 w-2.5 text-[#FF9B38]/90" /><span className="text-[9px] tabular-nums text-slate-300">{recTime}</span>
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wider" style={{ color: tone.c, borderColor: `${tone.c}59`, background: `${tone.c}26` }}>{led === 'green' ? 'VERIFIED' : led === 'red' ? 'FAULT' : 'SYNC'}</span>
          </div>
        </div>
        <div className="relative z-10 space-y-2">
          <div className={`flex items-center gap-2.5 rounded-lg border ${tone.b} bg-[#121620]/90 px-2.5 py-2`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone.b} ${tone.bg}`}><Icon className="h-4 w-4" style={{ color: tone.c }} /></div>
            <div className="min-w-0"><div className="text-[12px] font-bold leading-tight text-[#F5F7FA]">{headline}</div><div className="mt-0.5 text-[9px] leading-tight text-slate-400">{sub}</div></div>
          </div>
          <div className="space-y-1 rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 font-mono text-[9px] text-slate-300">
            <div className="flex justify-between gap-2"><span className="text-slate-500">{m.orderReferenceLabel.toUpperCase()}</span><span className="min-w-0 break-all text-right">{m.orderReference}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">{m.totalLabel.toUpperCase()}</span><span className="text-right font-semibold text-[#F5F7FA]">{m.total}</span></div>
            <div><span className="text-slate-500">ADDRESS</span><div className="break-all text-[8.5px] leading-tight text-slate-200">{m.walletAddress}</div></div>
          </div>
          {variant === 'order_confirmed' && <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full origin-left rounded-full bg-[#4FC482]" style={{ transform: `scaleX(${reduced || t >= 8.5 ? 1 : Math.max(0.04, feed)})` }} /></div>}
          <div className="truncate text-center font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">{m.networkLabel}</div>
        </div>
      </div>
    </div>
  );
}

const KEYS = [['1', 'QZ'], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
function Keypad() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      <div className="rt-basin rounded-xl border border-black/80 p-2.5">
        <div className="grid grid-cols-3 gap-1.5">{KEYS.map(([n, s]) => <div key={n} className="rt-key flex h-6 items-baseline justify-between rounded-[6px] border border-white/[0.07] px-2"><span className="my-auto font-mono text-[11px] font-semibold leading-none text-slate-200/95">{n}</span>{s && <span className="my-auto font-sans text-[7.5px] font-semibold leading-none tracking-wider text-slate-400/75">{s}</span>}</div>)}</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-white/[0.05] pt-1.5">
          {[['#d94e4e', 'ESC'], ['#d99b26', 'CLR'], ['#1e9e6a', 'OK']].map(([c, l]) => <div key={l} className="rt-key flex h-[26px] items-center justify-between rounded-[6px] border border-white/[0.07] px-2"><span className="h-1 w-2.5 rounded-full" style={{ background: c }} /><span className="font-mono text-[8.5px] font-semibold tracking-wider text-slate-300/90">{l}</span></div>)}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between px-1">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-400/60">PROXIMITY</span>
        <div className="flex h-3 w-32 items-center justify-center rounded-b-md rounded-t-sm border-t border-black bg-gradient-to-b from-[#060709] via-[#0c0e12] to-[#1a1d24] p-[2px]"><div className="flex h-1 w-full items-center justify-between rounded-full bg-[#040507] px-3"><span className="h-[1.5px] w-2 rounded-full bg-amber-500/35" /><span className="h-[1px] w-12 bg-slate-600/40" /><span className="h-[1.5px] w-2 rounded-full bg-amber-500/35" /></div></div>
      </div>
    </div>
  );
}

/** The 3D POS terminal (TerminalHousing + Paper + Screen + Keypad) from the approved export. Decorative; data is mirrored in accessible details. */
export function TerminalHousing({ m, t, reduced }: { m: ReceiptModel; t: number; reduced: boolean }) {
  const { feed, settlePx, feeding } = paperKinematics(t, m.variant);
  const preparing = m.variant === 'order_confirmed' && !reduced && t < 1.5;
  const led: Led = preparing ? 'amber' : ledFor(m.variant);
  const push = reduced || m.variant !== 'order_confirmed' ? 1 : 1 + Math.min(1, Math.max(0, (t - 1.5) / 5.5)) * 0.018;
  return (
    <div className="rt-stage relative flex select-none flex-col items-center justify-end" aria-hidden="true">
      <div className="rt-3d relative w-[308px]" style={{ transform: `scale(${push.toFixed(4)}) rotateX(8.5deg) rotateY(-10.5deg) rotateZ(0.4deg)` }}>
        <div className="pointer-events-none relative z-30 -mb-[14px]"><Paper m={m} feed={feed} settlePx={settlePx} feeding={feeding} /></div>
        <div className="relative">
          <div className="pointer-events-none absolute -right-[16px] bottom-[8px] top-[14px] flex w-[20px] flex-col items-center justify-between rounded-r-[22px] border-r border-t border-white/[0.12] bg-gradient-to-b from-[#252831] via-[#14161c] to-[#090a0d] py-8 shadow-[8px_12px_22px_rgba(0,0,0,0.75)]">
            <div className="absolute inset-y-3 left-[9px] w-[1.5px] bg-black/85" />
            <div className="relative h-5 w-2.5 rounded-sm border border-white/[0.08] bg-[#0c0d11]" />
            <div className="relative my-auto flex flex-col gap-1.5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[3px] w-2.5 rounded-full border-b border-white/[0.08] bg-[#090a0d]" />)}</div>
            <div className="relative h-2 w-2 rounded-full border border-white/[0.08] bg-[#0b0c10]" />
          </div>
          <div className="pointer-events-none absolute -bottom-[11px] -right-[10px] left-[14px] h-[14px] rounded-b-[22px] border-b border-white/[0.08] bg-gradient-to-r from-[#0c0d11] via-[#151820] to-[#0a0b0f] shadow-[0_14px_24px_rgba(0,0,0,0.85)]" />
          <div className="rt-chassis relative z-10 rounded-[24px] border border-white/[0.14] p-3.5">
            <div className="pointer-events-none absolute inset-x-5 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            <div className="rt-hood relative rounded-b-[10px] rounded-t-[16px] border border-white/[0.1] px-3 pb-2 pt-2.5">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-orange-500/70" /><span className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-400/80">THERMAL ROLL 58MM</span></div>
                <div className="flex items-center gap-1 rounded border border-white/[0.07] bg-black/60 px-1.5 py-0.5"><span className="h-1 w-3 rounded-sm bg-[#e8e3d5]/80" /><span className="font-mono text-[7.5px] text-slate-400">PAPER OK</span></div>
              </div>
              <div className="relative rounded-md border-t border-black bg-[#050608] p-1 shadow-[inset_0_3px_6px_rgba(0,0,0,0.98),0_1px_0_rgba(255,255,255,0.14)]">
                <div className="mb-[2px] h-[3px] w-full opacity-55" style={{ backgroundImage: 'linear-gradient(135deg, #64748b 25%, transparent 25%), linear-gradient(225deg, #64748b 25%, transparent 25%)', backgroundSize: '6px 3px' }} />
                <div className="rt-roller h-2.5 w-full rounded-[2px] border-y border-black/90" style={{ backgroundPositionX: `${reduced ? 0 : Math.round(feed * 140)}px` }} />
                <div className="mt-[2px] flex justify-between px-2"><span className="h-[1.5px] w-3 rounded-full bg-orange-500/50" /><span className="h-[1.5px] w-3 rounded-full bg-orange-500/50" /></div>
              </div>
            </div>
            <div className="my-2.5 flex items-center justify-between px-0.5">
              <div className="inline-flex items-center gap-2"><Mark size={20} /><span className="font-sans text-[13px] font-bold tracking-tight text-[#F5F7FA]">main_vault</span></div>
              <StatusLed color={led} reduced={reduced} />
            </div>
            <Screen m={m} variant={preparing ? 'preparing' : m.variant} t={t} feed={feed} reduced={reduced} />
            <div className="mt-3"><Keypad /></div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none relative -mt-2 h-8 w-[330px]"><div className="absolute inset-x-1 top-1 h-7 rounded-full bg-black/60 blur-xl" /><div className="absolute inset-x-7 top-1.5 h-3.5 rounded-full bg-black/80 blur-md" /></div>
    </div>
  );
}
