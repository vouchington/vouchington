import { EMBEDDING_COLUMNS, EMBEDDINGS_TABLE } from '@services/bedrock-embeddings/config'

export type PendingEntity = {
  id: string
  content: string
  content_sha256: Buffer
}

type EntityContentTransformer<TRow> = (
  row: TRow,
) =>
  | { content: string; content_sha256: Buffer }
  | Promise<{ content: string; content_sha256: Buffer }>

export async function* streamPendingEntities<TRow extends { id: string }>(
  rows: AsyncIterable<TRow>,
  contentTransformer: EntityContentTransformer<TRow>,
): AsyncGenerator<PendingEntity, void, unknown> {
  for await (const row of rows) {
    const { content, content_sha256 } = await contentTransformer(row)

    yield {
      id: row.id,
      content,
      content_sha256,
    }
  }
}

const SAFE_ALIAS_RE = /^[a-z_][a-z0-9_]*$/

export function reusableEmbeddingMissingClause(entityAlias: string): string {
  if (!SAFE_ALIAS_RE.test(entityAlias)) {
    throw new Error(`reusableEmbeddingMissingClause: unsafe alias "${entityAlias}"`)
  }
  return `NOT EXISTS (
    SELECT 1
    FROM ${EMBEDDINGS_TABLE} existing
    WHERE existing.content_sha256 = ${entityAlias}.${EMBEDDING_COLUMNS.content_sha256}
  )`
}
