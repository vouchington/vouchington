import { createHash } from 'node:crypto'

/**
 * Mirrors the identity the topic import derives for one actor's retry of one slug within one
 * import attempt, so a test can seed or read the admission claim the import will find. The
 * derivation is copied from the service; a change there fails the tests that use this.
 */
export function topicImportIdempotencyKeyForTest(
  actorId: string,
  importAttemptId: string,
  topicSlug: string,
): string {
  const hash = createHash('sha256')
    .update(`topic-import-recommendation:${actorId}:${importAttemptId}:${topicSlug}`)
    .digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
