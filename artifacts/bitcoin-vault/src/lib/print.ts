/** Opens a print dialog for plain text. Returns false when a popup was blocked. */
export function printText(title: string, text: string): boolean {
  const w = window.open('', '_blank', 'noopener=no,width=720,height=900');
  if (!w) return false;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font:13px/1.55 ui-monospace,Menlo,monospace;margin:32px;color:#111}pre{white-space:pre-wrap;word-break:break-all}</style></head><body><pre>${esc(text)}</pre></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
