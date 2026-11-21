import { EMBEDDING_COLUMNS, EMBEDDINGS_TABLE } from '@services/embeddings/config'

export type PendingEntity = {
  id: string
  title?: string
  content: string
  content_sha256: Buffer
}

type EmbeddingContent = {
  title?: string
  body?: string
  content: string
  content_sha256: Buffer
}

type EntityContentTransformer<TRow> = (row: TRow) => EmbeddingContent | Promise<EmbeddingContent>

export async function* streamPendingEntities<TRow extends { id: string }>(
  rows: AsyncIterable<TRow>,
  contentTransformer: EntityContentTransformer<TRow>,
): AsyncGenerator<PendingEntity, void, unknown> {
  for await (const row of rows) {
    const { title, body, content, content_sha256 } = await contentTransformer(row)

    yield {
      id: row.id,
      ...(title === undefined ? {} : { title }),
      content: body ?? content,
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
