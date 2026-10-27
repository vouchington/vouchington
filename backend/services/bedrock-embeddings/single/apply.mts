import { write, type QueryExecutor } from '@data-stores/psql'
import pgvector from 'pgvector/pg'
import { EMBEDDING_COLUMNS, TABLE_MAP } from '../config.mts'

export type SingleEmbeddingTarget = {
  type: 'post' | 'topic' | 'rss_feed_item'
  id: string
}

type EmbeddingValue = {
  embedding: number[]
  input_token_count: number | null
}

/** Apply a captured value without depending on the cache row surviving retention. */
export async function applySingleEmbedding(
  target: SingleEmbeddingTarget,
  contentSha256: Buffer,
  value: EmbeddingValue,
  query: QueryExecutor = write,
): Promise<void> {
  await query(
    `/* applySingleEmbedding */
    UPDATE ${TABLE_MAP[target.type]}
    SET ${EMBEDDING_COLUMNS.input_sha256} = $1,
      ${EMBEDDING_COLUMNS.embedding} = $2,
      ${EMBEDDING_COLUMNS.created_at} = NOW(),
      ${EMBEDDING_COLUMNS.input_token_count} = COALESCE(
        $3,
        CASE WHEN ${EMBEDDING_COLUMNS.input_sha256} = $1
          THEN ${EMBEDDING_COLUMNS.input_token_count}
          ELSE NULL
        END
      )
    WHERE id = $4
      AND ${EMBEDDING_COLUMNS.content_sha256} = $1`,
    [contentSha256, pgvector.toSql(value.embedding), value.input_token_count, target.id],
  )
}
