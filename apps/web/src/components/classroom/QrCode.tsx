import { encode } from 'uqr';
/** QR code drawn as SVG rectangles (no inline HTML, works under the strict CSP). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  const cells: string[] = [];
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) cells.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <rect width={size} height={size} fill="#fff" />
      <path d={cells.join('')} fill="#10201e" />
    </svg>
  );
}
