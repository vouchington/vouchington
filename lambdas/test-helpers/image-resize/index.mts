/**
 * Encode a string to base64url format (RFC 4648 §5)
 * Uses - instead of + and _ instead of /
 */
export function toBase64Url(input: string): string {
  return Buffer.from(input).toString('base64').replaceAll('+', '-').replaceAll('/', '_')
}
