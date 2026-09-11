import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { assertNoBlockedDomains } from '@services/domain-blacklist-check'

type UserProfile = {
  id: string
  markdown: string
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await read(
    sql`/* getProfile */ SELECT id, markdown FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
  )
  return rows[0] ?? null
}

const MAX_MARKDOWN_LENGTH = 10_000

export async function updateProfileMarkdown(userId: string, markdown: string): Promise<void> {
  assert(
    markdown.length <= MAX_MARKDOWN_LENGTH,
    400,
    `Markdown must be at most ${MAX_MARKDOWN_LENGTH} characters`,
  )
  await assertNoBlockedDomains(markdown)
  await write(
    sql`/* updateProfileMarkdown */ UPDATE users SET markdown = ${markdown} WHERE id = ${userId} AND deleted_at IS NULL`,
  )
  void enqueueOnUserUpdated(userId)
}
