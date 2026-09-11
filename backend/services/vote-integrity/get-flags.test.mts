import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { createTestUser, insertTestPost, insertTestVoteIntegrityFlag } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getVoteIntegrityFlagByIdFromPrimary, getVoteIntegrityFlags } from './get-flags.mts'

describe('getVoteIntegrityFlags pagination compatibility', () => {
  const randomSuffix = () => randomBytes(6).toString('hex')
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: `test-vi-flags-${randomSuffix()}` })
  }, 60_000)

  async function createFlag(): Promise<string> {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Vote integrity flag ${suffix}`,
      slug: `vote-integrity-flag-${suffix}`,
      createdById: user.id,
      markdown: 'test',
    })
    return insertTestVoteIntegrityFlag({ postId })
  }

  it('reads an exact flag by ID from the primary', async () => {
    const flagId = await createFlag()

    await expect(getVoteIntegrityFlagByIdFromPrimary(flagId)).resolves.toMatchObject({
      id: flagId,
    })
  }, 60_000)

  it('returns null for an unknown exact flag ID', async () => {
    await expect(getVoteIntegrityFlagByIdFromPrimary(uuidv7())).resolves.toBeNull()
  }, 60_000)

  it('accepts a legacy simple cursor continuation', async () => {
    const flagId = await createFlag()
    const result = await getVoteIntegrityFlags({ after: encodeCursor({ id: flagId }) })
    expect(result.results.every(flag => flag.id < flagId)).toBe(true)
  }, 60_000)

  it('rejects a scoped cursor from another status or resource', async () => {
    const flagId = await createFlag()
    await expect(
      getVoteIntegrityFlags({
        status: 'pending',
        after: encodeScopedUuidCursor(
          flagId,
          JSON.stringify({
            resource: 'vote-integrity-flags',
            status: 'resolved',
            order: 'id-desc',
          }),
        ),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getVoteIntegrityFlags({
        after: encodeScopedUuidCursor(flagId, 'report-integrity-flags'),
      }),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)
})
