/**
 * Derives the R2 key for a thumbnail from the original key.
 * e.g. "photo-abc123.jpg" -> "photo-abc123-thumb.webp"
 */
export function thumbKey(r2Key: string): string {
  const lastDot = r2Key.lastIndexOf('.');
  const base = lastDot !== -1 ? r2Key.slice(0, lastDot) : r2Key;
  return `${base}-thumb.webp`;
}
