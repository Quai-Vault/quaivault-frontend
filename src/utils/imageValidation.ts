/**
 * Validate that an image URL uses a safe protocol.
 * Prevents injection of javascript:, data:text/html, or other dangerous URIs
 * into <img> src attributes from untrusted on-chain metadata.
 */
export function isSafeImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('data:image/');
}
