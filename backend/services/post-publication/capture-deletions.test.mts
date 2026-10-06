import type { QueryInput, TransactionQuery } from '@data-stores/psql'
import { beginTransaction, createTestPost, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { lockPostPublication } from './lock.mts'
import { processAuthorDeletionPublicationBatch } from './capture-deletions.mts'

describe('processAuthorDeletionPublicationBatch', () => {
  it('takes post publication scopes before waiting on the deletion preimage', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected author')
    const post = await createTestPost({ user: author })
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    const holder = holdPostRow(post.id, rowLocked, releaseRow)
    await rowLocked.promise

    const publicationLocked = Promise.withResolvers<void>()
    const capture = captureAuthorDeletion(author.id, publicationLocked)
    try {
      await publicationLocked.promise
      await expect(probePostPublicationLock(post.id)).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseRow.resolve()
    }
    await holder
    await expect(capture).resolves.toBeUndefined()
  })
})

async function holdPostRow(
  postId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
) {
  await using query = await beginTransaction()
  await query(`SELECT 1 FROM posts WHERE id = $1::uuid FOR UPDATE`, [postId])
  locked.resolve()
  await release.promise
  await query.commit()
}
async function captureAuthorDeletion(
  authorId: string,
  publicationLocked: PromiseWithResolvers<void>,
) {
  await using query = await beginTransaction()
  await processAuthorDeletionPublicationBatch(
    gateWhenSqlReturns(query, 'lockPostPublicationCaptures', publicationLocked),
    authorId,
    null,
    100,
  )
  await query.commit()
}
function gateWhenSqlReturns(
  query: TransactionQuery,
  marker: string,
  locked: PromiseWithResolvers<void>,
): TransactionQuery {
  const gated = (async (input: QueryInput, values?: ReadonlyArray<unknown>) => {
    const result = await query(input, values)
    const text = typeof input === 'string' ? input : input.text
    if (text.includes(marker)) locked.resolve()
    return result
  }) as TransactionQuery
  gated.client = query.client
  return gated
}
async function probePostPublicationLock(postId: string) {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
