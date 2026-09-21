/**
 * A self-contained SVG QR (no network, CSP-safe) — scan to open the join page.
 * Shared by the projector standby and the master console so both offer the same
 * "scan to join" affordance.
 */
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export function Qr({ text, size = 200 }: { text: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`;
    return { d: path, n: count };
  }, [text]);
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-label="참여 QR"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}

/**
 * The phone join URL — the deployed origin + the event code. Scanning lands on
 * `/{code}`, which passes the 참여 코드 gate automatically. With no code it falls
 * back to `/b` (the code-entry screen).
 */
export function joinUrl(code?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/${code ?? 'b'}`;
}
