import { useMemo } from "react";
import { qrSvgPath } from "@/lib/qr";

export function QrCode({ value, label }: { value: string; label: string }) {
  const qr = useMemo(() => qrSvgPath(value), [value]);
  return (
    <svg viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label={label} className="h-full w-full" shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="white" />
      <path d={qr.path} fill="black" />
    </svg>
  );
}
