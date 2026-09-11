export function encodeTestCursor(cursor: Record<string, string>): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}
