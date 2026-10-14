import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number | bigint;
  hidden?: boolean;
  align?: 'right';
  className?: string;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  search: (row: T) => string;
  placeholder?: string;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  testId: string;
  /** Optional mobile (<768px) card renderer. When provided the table is shown from md up only. */
  mobileCard?: (row: T) => ReactNode;
  /** Changing this value (e.g. external filters) returns to the first page. */
  resetKey?: string;
};

export function DataTable<T>({ rows, columns, rowKey, search, placeholder, toolbar, onRowClick, empty, pageSize = 25, initialSort, testId, mobileCard, resetKey }: Props<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(columns.map((c) => [c.key, !c.hidden])));
  const [lastReset, setLastReset] = useState(resetKey);
  if (lastReset !== resetKey) { setLastReset(resetKey); setPage(0); }

  // Search strings are computed once per rows reference, not per keystroke.
  const indexed = useMemo(() => rows.map((r) => ({ r, s: search(r).toLowerCase() })), [rows, search]);
  const sortFn = useMemo(() => (sort ? columns.find((c) => c.key === sort.key)?.sort : undefined), [columns, sort]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hits = term ? indexed.filter((x) => x.s.includes(term)) : indexed.slice();
    if (sort && sortFn) {
      const keyed = hits.map((x, i) => ({ r: x.r, v: sortFn(x.r), i }));
      keyed.sort((a, b) => {
        const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
        return (sort.dir === 'asc' ? c : -c) || a.i - b.i;
      });
      return keyed.map((x) => x.r);
    }
    return hits.map((x) => x.r);
  }, [indexed, q, sort, sortFn]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * size, cur * size + size);
  const cols = columns.filter((c) => visible[c.key]);
  const sortable = columns.filter((c) => c.sort);

  return (
    <div className="min-w-0 space-y-3" data-testid={testId}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label={placeholder ?? 'Search'} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={placeholder ?? 'Search'} className="h-11 bg-card pl-9 font-mono text-sm md:h-9 md:text-xs" data-testid={`input-search-${testId}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {mobileCard && sortable.length > 0 && (
            <div className="flex items-center gap-1 md:hidden">
              <select aria-label="Sort by" value={sort?.key ?? ''} onChange={(e) => { setSort({ key: e.target.value, dir: sort?.dir ?? 'desc' }); setPage(0); }} className="h-11 rounded-md border border-input bg-card px-2 font-mono text-[11px] uppercase" data-testid={`select-sort-${testId}`}>
                {!sort && <option value="">Sort</option>}
                {sortable.map((c) => <option key={c.key} value={c.key}>Sort: {c.label}</option>)}
              </select>
              <Button variant="outline" size="icon" className="h-11 w-11 bg-card" disabled={!sort} aria-label={sort?.dir === 'asc' ? 'Ascending, switch to descending' : 'Descending, switch to ascending'}
                onClick={() => sort && setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })} data-testid={`button-sortdir-${testId}`}>
                {sort?.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-11 gap-1.5 bg-card font-mono text-[11px] uppercase md:h-9', mobileCard && 'hidden md:inline-flex')} data-testid={`button-columns-${testId}`}>
                <Columns3 className="h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest">Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((c) => (
                <DropdownMenuCheckboxItem key={c.key} checked={visible[c.key]} onCheckedChange={(v) => setVisible((s) => ({ ...s, [c.key]: !!v }))} onSelect={(e) => e.preventDefault()} data-testid={`toggle-column-${c.key}`}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {filtered.length === 0 ? empty : (
        <>
          {mobileCard && (
            <ul className="space-y-2 md:hidden" data-testid={`list-${testId}`}>
              {slice.map((r) => {
                const k = rowKey(r);
                return (
                  <li key={k} className="min-w-0 overflow-hidden rounded-md border border-card-border bg-card p-3 shadow-sm" data-testid={`card-${testId}-${k}`}>
                    {mobileCard(r)}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={cn('max-w-full overflow-x-auto overscroll-x-contain rounded-md border border-card-border bg-card shadow-sm', mobileCard && 'hidden md:block')} tabIndex={0} role="region" aria-label={`${testId} table, scrolls horizontally`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {cols.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn('px-3 py-1 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap', c.align === 'right' && 'text-right')}>
                      {c.sort ? (
                        <button
                          type="button"
                          className={cn('inline-flex min-h-11 items-center gap-1 hover:text-foreground transition-colors', sort?.key === c.key && 'text-primary')}
                          onClick={() => { setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' })); setPage(0); }}
                          data-testid={`sort-${c.key}`}
                        >
                          {c.label}
                          {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => {
                  const k = rowKey(r);
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      className={cn('border-b border-border/60 last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-primary/[0.04]')}
                      data-testid={`row-${testId}-${k}`}
                    >
                      {cols.map((c) => (
                        <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.align === 'right' && 'text-right', c.className)}>{c.render(r)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span data-testid={`text-count-${testId}`} aria-live="polite">{filtered.length} of {rows.length} loaded records</span>
        <div className="flex items-center gap-2">
          <select aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-11 rounded-md border border-input bg-card px-2 md:h-8" data-testid={`select-pagesize-${testId}`}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <Button variant="outline" size="icon" aria-label="Previous page" className="h-11 w-11 bg-card md:h-8 md:w-8" disabled={cur === 0} onClick={() => setPage(cur - 1)} data-testid={`button-prev-${testId}`}><ChevronLeft className="h-4 w-4" /></Button>
          <span data-testid={`text-page-${testId}`}>{cur + 1} / {pages}</span>
          <Button variant="outline" size="icon" aria-label="Next page" className="h-11 w-11 bg-card md:h-8 md:w-8" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} data-testid={`button-next-${testId}`}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
