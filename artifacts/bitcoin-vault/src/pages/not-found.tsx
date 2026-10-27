import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export default function NotFound() {
  const [location] = useLocation();
  const sandbox = location === '/sandbox' || location.startsWith('/sandbox/');
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-warn" />
            <h1 className="text-2xl font-bold text-foreground">
              Page not found
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            This address does not match a vault page. No payment has been started.
          </p>
          <Link href={sandbox ? '/sandbox' : '/'} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Back to {sandbox ? 'Sandbox' : 'your vault'}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
