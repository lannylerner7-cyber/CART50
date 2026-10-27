import { QRCodeSVG } from 'qrcode.react';
import { BRAND_MARK } from '@/lib/assets';
import { cn } from '@/lib/utils';

/** QR for a server-verified address with the local brand mark excavated at the center (level H tolerates the cut-out). */
export function BrandedQr({ value, size = 186, title, testId, className }: { value: string; size?: number; title: string; testId?: string; className?: string }) {
  // Keep long Taproot payment URIs legible at normal device pixel density.
  const renderedSize = Math.max(228, size);
  const mark = Math.round(renderedSize * 0.14);
  return (
    <div className={cn('mx-auto grid w-fit place-items-center rounded-[18px] bg-[#fbfaf7]', className)}>
      <QRCodeSVG
        value={value}
        size={renderedSize}
        level="H"
        marginSize={4}
        bgColor="#fbfaf7"
        fgColor="#0b0b0d"
        title={title}
        imageSettings={{ src: BRAND_MARK, width: mark, height: mark, excavate: true }}
        className="block h-auto max-w-full"
        data-testid={testId}
      />
    </div>
  );
}
