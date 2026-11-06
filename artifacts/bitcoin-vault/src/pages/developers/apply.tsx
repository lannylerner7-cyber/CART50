import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Cookie, FileText } from 'lucide-react';
import { Card, DevFrame, Notice } from '@/components/developer-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { devErr, useDev, useDevAction } from '@/lib/developer';

export { Landing } from '@/pages/developers/landing';

export function Apply() {
  const { session, setAcceptedTerms } = useDev();
  const [, nav] = useLocation();
  const terms = session.terms;
  const [open, setOpen] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [agree, setAgree] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const el = box.current;
    if (el) setAtEnd(el.clientHeight > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }, []);
  const setBox = useCallback((el: HTMLDivElement | null) => { box.current = el; if (el) requestAnimationFrame(measure); }, [measure]);
  useEffect(() => { if (!open) { setAtEnd(false); setAgree(false); } }, [open]);
  useEffect(() => {
    if (!open || !box.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    measure();
    return () => observer.disconnect();
  }, [open, measure, terms.text]);

  const blocked = !terms.signupEnabled;
  const proceed = () => { if (!atEnd || !agree || blocked) return; setAcceptedTerms(terms.version); setOpen(false); nav('/register'); };

  return (
    <DevFrame step="Apply" title="Read the terms first." desc="You will be asked for a name and an email address after you accept. Nothing else is collected."
      aside={<Card><div className="flex items-center gap-2 font-semibold text-foreground"><Cookie className="h-4 w-4" /> Cookies</div><p className="mt-2">Only necessary cookies are used: a secure session cookie and a CSRF token so sign-in and verification work. No analytics, advertising or tracking cookies are set, and nothing optional is switched on.</p></Card>}>
      <Card testId="card-terms-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[14px] font-semibold">Developer terms · version <span className="font-mono">{terms.version}</span></div>
          {!terms.approved && <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11.5px] font-bold text-warn" data-testid="status-terms-draft">Draft, not final legal text</span>}
        </div>
        <p className="mt-2 text-[14px] text-muted-foreground">Scroll to the end of the terms, tick the box, then continue. The box stays disabled until you reach the end.</p>
        {blocked && <div className="mt-4"><Notice tone="warn" testId="status-signup-disabled">Registration is temporarily closed. You can still read the agreement, but cannot create an account right now.</Notice></div>}
        <Button className="mt-5 h-12 rounded-full px-6 font-bold" onClick={() => setOpen(true)} data-testid="button-open-terms"><FileText className="h-4 w-4" /> Read terms</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[24px] p-0" data-testid="dialog-terms">
          <DialogHeader className="shrink-0 border-b border-border p-5">
            <DialogTitle className="font-display text-xl">Developer terms {!terms.approved && <span className="ml-2 align-middle text-[12px] font-bold text-warn">DRAFT</span>}</DialogTitle>
            <DialogDescription>Version {terms.version}. Scroll to the end to enable acceptance.</DialogDescription>
          </DialogHeader>
          <div ref={setBox} onScroll={measure} tabIndex={0} role="region" aria-label="Terms text" className="min-h-0 max-h-[50dvh] overflow-y-auto overscroll-contain whitespace-pre-wrap p-5 text-[14px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="region-terms">
            {terms.text || 'No terms text was returned by the server.'}
            <div className="mt-6 border-t border-dashed border-border pt-3 text-[12px] text-muted-foreground">End of terms.</div>
          </div>
          <DialogFooter className="shrink-0 flex-col gap-3 border-t border-border p-5 sm:flex-col">
            {blocked && <p role="status" className="text-sm text-warn">Registration is temporarily closed. Accepting the agreement does not reopen it.</p>}
            <label htmlFor="accept-developer-terms" className={`flex min-h-11 items-start gap-3 text-[14px] ${atEnd ? 'cursor-pointer' : 'opacity-60'}`}>
              <Checkbox id="accept-developer-terms" checked={agree} disabled={!atEnd} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" data-testid="checkbox-accept-terms" />
              <span>I have read and accept these terms.{!atEnd && <span className="block text-[12px] text-muted-foreground">Scroll to the end first.</span>}</span>
            </label>
            <Button className="h-12 rounded-full font-bold" disabled={!atEnd || !agree || blocked} onClick={proceed} data-testid="button-terms-continue">{blocked ? 'Signup closed' : 'Continue'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DevFrame>
  );
}

export function Register() {
  const { session, acceptedTerms, setEmail } = useDev();
  const [, nav] = useLocation();
  const reg = useDevAction();
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim());
  const ok = name.trim().length > 0 && validEmail;

  if (!acceptedTerms || acceptedTerms !== session.terms.version || !session.terms.signupEnabled) {
    return (
      <DevFrame step="Apply" title="Accept the terms first." desc="Acceptance is kept in this tab only. Refreshing asks again.">
        <Link href="/apply" className="pill-btn" data-testid="link-back-apply">Back to terms</Link>
      </DevFrame>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || reg.isPending) return;
    const email = mail.trim();
    reg.mutate({ action: 'register', data: { name: name.trim(), email, termsVersion: acceptedTerms, accepted: true } }, {
      onSuccess: () => { setEmail(email); nav('/verify'); },
    });
  };
  return (
    <DevFrame step="Apply" title="Who should we email?" desc="A one-time 24-character key will be sent to this address."
      aside={<Card><p>Name and email are the only fields. They are used to identify your account and send verification. They are not shared or used for marketing.</p></Card>}>
      <Card>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5"><Label htmlFor="dev-name">Name</Label><Input id="dev-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl" data-testid="input-dev-name" /></div>
          <div className="grid gap-1.5"><Label htmlFor="dev-email">Email</Label><Input id="dev-email" type="email" autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} className="h-12 rounded-2xl" data-testid="input-dev-email" />
            {mail && !validEmail && <span className="text-[12.5px] text-destructive">Enter a full email address.</span>}</div>
          {reg.isError && <Notice tone="bad" testId="status-register-error">{devErr(reg.error, 'Registration failed. Try again.')}</Notice>}
          <Button type="submit" className="h-12 rounded-full font-bold" disabled={!ok || reg.isPending} data-testid="button-register">{reg.isPending ? 'Sending' : 'Send verification key'}</Button>
        </form>
      </Card>
    </DevFrame>
  );
}
