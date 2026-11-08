import { randomUUID } from 'node:crypto'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { setTestPostCurrentModerationInputHashFromResult } from './entities/agent-moderation-retention.mts'

/** Observe a committed post update while retention still owns its work transaction. */
export async function updateTestRetentionPostMarkdownWithLockTimeout(
  postId: string,
): Promise<string> {
  const markdown = `Retention post update ${randomUUID()}`
  await withRetentionPostLockTimeout(query =>
    query(sql`/* updateTestRetentionPostMarkdownWithLockTimeout */
      UPDATE posts SET markdown = ${markdown} WHERE id = ${postId}::uuid`),
  )
  const { rows } = await write<{ markdown: string }>(sql`/* readUpdatedTestRetentionPostMarkdown */
    SELECT markdown FROM posts WHERE id = ${postId}::uuid`)
  return rows[0]?.markdown ?? ''
}

/** A regressed post lock must fail promptly instead of deadlocking the injected update. */
export async function setTestRetentionPostHashWithLockTimeout(
  postId: string,
  moderationId: string,
): Promise<void> {
  await withRetentionPostLockTimeout(query =>
    setTestPostCurrentModerationInputHashFromResult(postId, moderationId, query),
  )
}

async function withRetentionPostLockTimeout(
  update: (query: QueryExecutor) => Promise<unknown>,
): Promise<void> {
  await using writer = await beginTransaction()
  await writer(`/* retentionPostLockTimeout */ SET LOCAL lock_timeout = '100ms'`)
  await update(writer)
  await writer.commit()
}
