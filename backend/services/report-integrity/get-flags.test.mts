import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect, insertTestReportIntegrityFlag } from '@voucha/test-helpers'
import { getReportIntegrityFlags, getReportIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import type { PrivateUser } from '@services/users/types'
import { decodeScopedUuidCursor, encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'

describe('getReportIntegrityFlags / getReportIntegrityFlagByIdFromPrimary', () => {
  const randomUsername = () => `test-ri-gf-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    targetUser = await createTestUserDirect({ username: randomUsername() })
  })

  async function createFlag(): Promise<string> {
    const target = await createTestUserDirect({ username: randomUsername() })
    return insertTestReportIntegrityFlag({ reportedUserId: target.id, reporterCount: 5 })
  }
  async function createBatch(count: 2 | 3): Promise<string[]> {
    const target = await createTestUserDirect({ username: randomUsername() })
    const ids = [await insertTestReportIntegrityFlag({ reportedUserId: target.id })]
    for (let index = 1; index < count; index++) {
      ids.push(
        await insertTestReportIntegrityFlag({
          reportedUserId: target.id,
          resolvedAt: new Date('2020-01-01T00:00:00.000Z'),
          resolution: 'dismissed',
        }),
      )
    }
    return ids
  }

  describe('getReportIntegrityFlagByIdFromPrimary', () => {
    it('returns the flag for a known ID', async () => {
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser.id,
        reporterCount: 5,
      })

      const flag = await getReportIntegrityFlagByIdFromPrimary(flagId)
      expect(flag).not.toBeNull()
      expect(flag!.id).toBe(flagId)
      expect(flag!.reported_user_id).toBe(targetUser.id)
      expect(flag!.flag_type).toBe('mass_report_suspected')
    })

    it('returns null for an unknown UUID', async () => {
      const flag = await getReportIntegrityFlagByIdFromPrimary(uuidv7())
      expect(flag).toBeNull()
    })
  })

  describe('getReportIntegrityFlags', () => {
    it('returns results and page_info', async () => {
      const id = await createFlag()
      const result = await getReportIntegrityFlags({ ids: [id] })
      expect(result.results.map(flag => flag.id)).toEqual([id])
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.page_info).toHaveProperty('has_next_page')
      expect(result.page_info).toHaveProperty('end_cursor')
      expect(result.page_info).toHaveProperty('start_cursor')
      const unfiltered = await getReportIntegrityFlags({ limit: 1 })
      const scope = JSON.stringify({
        resource: 'report-integrity-flags',
        status: 'all',
        order: 'id-desc',
      })
      const cursor = unfiltered.page_info.start_cursor!
      expect(decodeScopedUuidCursor(cursor, scope, 'Invalid cursor format').scope).toBe(scope)
    })

    it('filters by status=pending returns only unresolved flags', async () => {
      const pendingTarget = await createTestUserDirect({ username: randomUsername() })
      const pendingId = await insertTestReportIntegrityFlag({
        reportedUserId: pendingTarget.id,
        reporterCount: 5,
        resolvedAt: null,
        resolution: null,
      })

      const resolvedId = await insertTestReportIntegrityFlag({
        reportedUserId: pendingTarget.id,
        resolvedAt: new Date('2020-01-01T00:00:00.000Z'),
        resolution: 'dismissed',
      })
      const result = await getReportIntegrityFlags({
        status: 'pending',
        ids: [pendingId, resolvedId],
      })
      expect(result.results.map(flag => flag.id)).toEqual([pendingId])
      expect(result.results.every(f => f.resolved_at === null)).toBe(true)
    })

    it('filters by status=resolved returns only resolved flags', async () => {
      const resolvedTarget = await createTestUserDirect({ username: randomUsername() })
      const resolvedId = await insertTestReportIntegrityFlag({
        reportedUserId: resolvedTarget.id,
        reporterCount: 5,
        resolvedAt: new Date('2020-01-01T00:00:00.000Z'),
        resolution: 'dismissed',
      })

      const pendingId = await insertTestReportIntegrityFlag({
        reportedUserId: resolvedTarget.id,
        reporterCount: 5,
      })
      const result = await getReportIntegrityFlags({
        status: 'resolved',
        ids: [pendingId, resolvedId],
      })
      expect(result.results.map(flag => flag.id)).toEqual([resolvedId])
      expect(result.results.every(f => f.resolved_at !== null)).toBe(true)
    })

    it('paginates: has_next_page=true and end_cursor when limit < total flags', async () => {
      const ids = await createBatch(3)

      const firstPage = await getReportIntegrityFlags({ limit: 2, ids })
      // The owned selection contains exactly three flags.
      expect(firstPage.results.map(flag => flag.id)).toEqual(
        [...ids].toSorted().toReversed().slice(0, 2),
      )
      expect(firstPage.page_info.has_next_page).toBe(true)
      expect(firstPage.page_info.end_cursor).not.toBeNull()
      expect(firstPage.results).toHaveLength(2)
    })

    it('fetches next page via after cursor', async () => {
      const ids = await createBatch(3)

      const firstPage = await getReportIntegrityFlags({ limit: 2, ids })
      expect(firstPage.page_info.has_next_page).toBe(true)
      const cursor = firstPage.page_info.end_cursor
      expect(cursor).not.toBeNull()

      const secondPage = await getReportIntegrityFlags({ limit: 2, after: cursor!, ids })
      expect(Array.isArray(secondPage.results)).toBe(true)
      expect(firstPage.results.map(flag => flag.id)).toEqual(
        [...ids].toSorted().toReversed().slice(0, 2),
      )
      expect(secondPage.results.map(flag => flag.id)).toEqual(
        [...ids].toSorted().toReversed().slice(2),
      )
      expect(secondPage.page_info.has_next_page).toBe(false)
      expect(secondPage.page_info.end_cursor).toBeNull()
      // IDs should not overlap with first page
      const firstIds = new Set(firstPage.results.map(f => f.id))
      for (const flag of secondPage.results) {
        expect(firstIds.has(flag.id)).toBe(false)
      }
    })

    it('throws 400 for invalid cursor format', async () => {
      await expect(getReportIntegrityFlags({ after: 'not-a-valid-cursor' })).rejects.toThrow(
        'Invalid cursor format',
      )
    })

    it('rejects an unscoped simple cursor', async () => {
      const flagId = uuidv7()
      await expect(
        getReportIntegrityFlags({ after: encodeCursor({ id: flagId }) }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('rejects a scoped cursor from another status or resource', async () => {
      const id = uuidv7()
      await expect(
        getReportIntegrityFlags({
          status: 'pending',
          after: encodeScopedUuidCursor(
            id,
            JSON.stringify({
              resource: 'report-integrity-flags',
              status: 'resolved',
              order: 'id-desc',
            }),
          ),
        }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        getReportIntegrityFlags({
          after: encodeScopedUuidCursor(id, 'vote-integrity-flags'),
        }),
      ).rejects.toMatchObject({ status: 400 })
    })
  })

  it('returns an empty owned selection and ignores missing selected IDs', async () => {
    const id = await createFlag()
    const present = await getReportIntegrityFlags({ ids: [id] })
    expect(present.results.map(flag => flag.id)).toEqual([id])
    for (const ids of [[], [uuidv7()]]) {
      const result = await getReportIntegrityFlags({ ids })
      expect(result.results).toEqual([])
      expect(result.page_info).toEqual({
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      })
    }
  })

  it('normalizes the selected set without mutating it across pages', async () => {
    const batch = await createBatch(3)
    const ids = batch.slice(0, 2)
    const excludedId = batch[2]
    const input = [ids[0].toUpperCase(), ids[1], ids[0]]
    const original = [...input]
    const expected = [...ids].toSorted().toReversed()
    const first = await getReportIntegrityFlags({ ids: input, limit: 1 })
    expect(input).toEqual(original)
    expect(first.results.map(flag => flag.id)).toEqual([expected[0]])
    expect(first.results.map(flag => flag.id)).not.toContain(excludedId)
    expect(first.page_info.end_cursor).toEqual(expect.any(String))
    const second = await getReportIntegrityFlags({
      ids: [...ids].toReversed(),
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(flag => flag.id)).toEqual([expected[1]])
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('rejects cursors when the selected set changes or is omitted', async () => {
    const ids = await createBatch(2)
    const first = await getReportIntegrityFlags({ ids, limit: 1 })
    expect(first.page_info.end_cursor).toEqual(expect.any(String))
    const after = first.page_info.end_cursor!
    for (const selection of [[ids[0]], [], undefined]) {
      await expect(getReportIntegrityFlags({ ids: selection, after })).rejects.toMatchObject({
        status: 400,
      })
    }
    const unfilteredScope = JSON.stringify({
      resource: 'report-integrity-flags',
      status: 'all',
      order: 'id-desc',
    })
    await expect(
      getReportIntegrityFlags({ ids, after: encodeScopedUuidCursor(ids[0], unfilteredScope) }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects invalid or over-budget selected IDs', async () => {
    await expect(getReportIntegrityFlags({ ids: ['not-a-uuid'] })).rejects.toMatchObject({
      status: 422,
    })
    await expect(getReportIntegrityFlags({ ids: Array<string>(1) })).rejects.toMatchObject({
      status: 422,
    })
    // Minimum raw entries crossing the 100-entry bound; one unique scalar ID and no rows.
    const ids = Array<string>(101).fill(uuidv7())
    await expect(getReportIntegrityFlags({ ids })).rejects.toMatchObject({ status: 422 })
  })
})
