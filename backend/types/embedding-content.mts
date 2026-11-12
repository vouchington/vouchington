import { createHash } from 'node:crypto'

/** Full unsampled document identity: title/body boundaries must survive cache hashing. */
export function createEmbeddingDocumentHash(body: string, title?: string): Buffer {
  return createHash('sha256')
    .update(JSON.stringify([(title || 'none').toWellFormed(), body.toWellFormed()]))
    .digest()
}
