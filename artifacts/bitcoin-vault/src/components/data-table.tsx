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
};

export function DataTable<T>({ rows, columns, rowKey, search, placeholder, toolbar, onRowClick, empty, pageSize = 25, initialSort, testId }: Props<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(columns.map((c) => [c.key, !c.hidden])));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = term ? rows.filter((r) => search(r).toLowerCase().includes(term)) : rows.slice();
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sort) {
        const f = col.sort;
        out = out.sort((a, b) => {
          const x = f(a), y = f(b);
          const c = x < y ? -1 : x > y ? 1 : 0;
          return sort.dir === 'asc' ? c : -c;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * size, cur * size + size);
  const cols = columns.filter((c) => visible[c.key]);

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={placeholder ?? 'Search'} className="h-9 bg-card pl-8 font-mono text-xs" data-testid={`input-search-${testId}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-card font-mono text-[11px] uppercase" data-testid={`button-columns-${testId}`}>
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
        <div className="overflow-x-auto rounded-md border border-card-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {cols.map((c) => (
                  <th key={c.key} className={cn('px-3 py-2 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap', c.align === 'right' && 'text-right')}>
                    {c.sort ? (
                      <button
                        className={cn('inline-flex items-center gap-1 hover:text-foreground transition-colors', sort?.key === c.key && 'text-primary')}
                        onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}
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
              {slice.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn('border-b border-border/60 last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-primary/[0.04]')}
                  data-testid={`row-${testId}-${rowKey(r)}`}
                >
                  {cols.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.align === 'right' && 'text-right', c.className)}>{c.render(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span data-testid={`text-count-${testId}`}>{filtered.length} of {rows.length} records</span>
        <div className="flex items-center gap-2">
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-7 rounded-sm border border-input bg-card px-1.5" data-testid={`select-pagesize-${testId}`}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <Button variant="outline" size="icon" className="h-7 w-7 bg-card" disabled={cur === 0} onClick={() => setPage(cur - 1)} data-testid={`button-prev-${testId}`}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <span>{cur + 1} / {pages}</span>
          <Button variant="outline" size="icon" className="h-7 w-7 bg-card" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} data-testid={`button-next-${testId}`}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}
