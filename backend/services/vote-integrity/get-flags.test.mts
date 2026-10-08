import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { decodeScopedUuidCursor, encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { createTestUser, insertTestPost, insertTestVoteIntegrityFlag } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getVoteIntegrityFlagByIdFromPrimary, getVoteIntegrityFlags } from './get-flags.mts'

describe('getVoteIntegrityFlags pagination compatibility', () => {
  const randomSuffix = () => randomBytes(6).toString('hex')
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ username: `test-vi-flags-${randomSuffix()}` })
  })

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

  async function createPair(): Promise<string[]> {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Vote integrity pair ${suffix}`,
      slug: `vote-integrity-pair-${suffix}`,
      createdById: user.id,
      markdown: 'test',
    })
    return Promise.all([
      insertTestVoteIntegrityFlag({ postId }),
      insertTestVoteIntegrityFlag({ postId, flagType: 'ip_correlation' }),
    ])
  }

  it('reads an exact flag by ID from the primary', async () => {
    const flagId = await createFlag()

    await expect(getVoteIntegrityFlagByIdFromPrimary(flagId)).resolves.toMatchObject({
      id: flagId,
    })
  })

  it('returns null for an unknown exact flag ID', async () => {
    await expect(getVoteIntegrityFlagByIdFromPrimary(uuidv7())).resolves.toBeNull()
  })

  it('rejects a legacy simple cursor continuation', async () => {
    const flagId = uuidv7()
    await expect(
      getVoteIntegrityFlags({ after: encodeCursor({ id: flagId }) }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('continues with a server-issued scoped cursor', async () => {
    const ids = await createPair()

    const first = await getVoteIntegrityFlags({ limit: 1, ids })
    expect(first.results).toHaveLength(1)
    expect(first.results.map(flag => flag.id)).toEqual([[...ids].toSorted().toReversed()[0]])
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).toEqual(expect.any(String))

    const second = await getVoteIntegrityFlags({
      limit: 1,
      after: first.page_info.end_cursor!,
      ids,
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0].id).not.toBe(first.results[0].id)
    expect(second.results.map(flag => flag.id)).toEqual([[...ids].toSorted().toReversed()[1]])
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('rejects a scoped cursor from another status or resource', async () => {
    const flagId = uuidv7()
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
  })

  it('returns an empty owned selection and ignores missing selected IDs', async () => {
    const id = await createFlag()
    const present = await getVoteIntegrityFlags({ ids: [id] })
    expect(present.results.map(flag => flag.id)).toEqual([id])
    const unfiltered = await getVoteIntegrityFlags({ limit: 1 })
    const scope = JSON.stringify({
      resource: 'vote-integrity-flags',
      status: 'all',
      order: 'id-desc',
    })
    const cursor = unfiltered.page_info.start_cursor!
    expect(decodeScopedUuidCursor(cursor, scope, 'Invalid cursor format').scope).toBe(scope)
    for (const ids of [[], [uuidv7()]]) {
      const result = await getVoteIntegrityFlags({ ids })
      expect(result.results).toEqual([])
      expect(result.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    }
  })

  it('normalizes the selected set without mutating it across pages', async () => {
    const ids = await createPair()
    const excludedId = await createFlag()
    const input = [ids[0].toUpperCase(), ids[1], ids[0]]
    const original = [...input]
    const expected = [...ids].toSorted().toReversed()
    const first = await getVoteIntegrityFlags({ ids: input, limit: 1 })
    expect(input).toEqual(original)
    expect(first.results.map(flag => flag.id)).toEqual([expected[0]])
    expect(first.results.map(flag => flag.id)).not.toContain(excludedId)
    expect(first.page_info.end_cursor).toEqual(expect.any(String))
    const second = await getVoteIntegrityFlags({
      ids: [...ids].toReversed(),
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(flag => flag.id)).toEqual([expected[1]])
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('rejects cursors when the selected set changes or is omitted', async () => {
    const ids = await createPair()
    const first = await getVoteIntegrityFlags({ ids, limit: 1 })
    expect(first.page_info.end_cursor).toEqual(expect.any(String))
    const after = first.page_info.end_cursor!
    for (const selection of [[ids[0]], [], undefined]) {
      await expect(getVoteIntegrityFlags({ ids: selection, after })).rejects.toMatchObject({
        status: 400,
      })
    }
    const unfilteredScope = JSON.stringify({
      resource: 'vote-integrity-flags',
      status: 'all',
      order: 'id-desc',
    })
    await expect(
      getVoteIntegrityFlags({ ids, after: encodeScopedUuidCursor(ids[0], unfilteredScope) }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects invalid or over-budget selected IDs', async () => {
    await expect(getVoteIntegrityFlags({ ids: ['not-a-uuid'] })).rejects.toMatchObject({
      status: 422,
    })
    await expect(getVoteIntegrityFlags({ ids: Array<string>(1) })).rejects.toMatchObject({
      status: 422,
    })
    // Minimum raw entries crossing the 100-entry bound; one unique scalar ID and no rows.
    const ids = Array<string>(101).fill(uuidv7())
    await expect(getVoteIntegrityFlags({ ids })).rejects.toMatchObject({ status: 422 })
  })
})
