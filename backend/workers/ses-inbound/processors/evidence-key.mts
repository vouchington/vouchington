/** Stable raw-email destination for exact SES replay and private evidence cleanup. */
export function copyrightEvidenceEmailKey(sesMessageId: string, sha256: Buffer): string {
  return `email/${sesMessageId}/${sha256.toString('hex')}.eml`
}
