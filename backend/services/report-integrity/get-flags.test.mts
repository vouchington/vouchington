import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect, insertTestReportIntegrityFlag } from '@voucha/test-helpers'
import { getReportIntegrityFlags, getReportIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'

describe('getReportIntegrityFlags / getReportIntegrityFlagByIdFromPrimary', () => {
  const randomUsername = () => `test-ri-gf-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    targetUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

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
    }, 60_000)

    it('returns null for an unknown UUID', async () => {
      const flag = await getReportIntegrityFlagByIdFromPrimary(uuidv7())
      expect(flag).toBeNull()
    }, 60_000)
  })

  describe('getReportIntegrityFlags', () => {
    it('returns results and page_info', async () => {
      const result = await getReportIntegrityFlags()
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.page_info).toHaveProperty('has_next_page')
      expect(result.page_info).toHaveProperty('end_cursor')
      expect(result.page_info).toHaveProperty('start_cursor')
    }, 60_000)

    it('filters by status=pending returns only unresolved flags', async () => {
      const pendingTarget = await createTestUserDirect({ username: randomUsername() })
      await insertTestReportIntegrityFlag({
        reportedUserId: pendingTarget.id,
        reporterCount: 5,
        resolvedAt: null,
        resolution: null,
      })

      const result = await getReportIntegrityFlags({ status: 'pending' })
      expect(result.results.every(f => f.resolved_at === null)).toBe(true)
    }, 60_000)

    it('filters by status=resolved returns only resolved flags', async () => {
      const resolvedTarget = await createTestUserDirect({ username: randomUsername() })
      await insertTestReportIntegrityFlag({
        reportedUserId: resolvedTarget.id,
        reporterCount: 5,
        resolvedAt: new Date(),
        resolution: 'dismissed',
      })

      const result = await getReportIntegrityFlags({ status: 'resolved' })
      expect(result.results.every(f => f.resolved_at !== null)).toBe(true)
    }, 60_000)

    it('paginates: has_next_page=true and end_cursor when limit < total flags', async () => {
      // Insert enough flags to exceed a limit of 2
      const targets = await Promise.all(
        Array.from({ length: 3 }, () => createTestUserDirect({ username: randomUsername() })),
      )
      await Promise.all(
        targets.map(t =>
          insertTestReportIntegrityFlag({
            reportedUserId: t!.id,
            reporterCount: 5,
          }),
        ),
      )

      const firstPage = await getReportIntegrityFlags({ limit: 2 })
      // There are at least 3 flags in the DB from this test run alone
      expect(firstPage.page_info.has_next_page).toBe(true)
      expect(firstPage.page_info.end_cursor).not.toBeNull()
      expect(firstPage.results).toHaveLength(2)
    }, 60_000)

    it('fetches next page via after cursor', async () => {
      // Seed fresh flags with a known prefix so we can isolate this test
      const paginationTargets = await Promise.all(
        Array.from({ length: 3 }, () => createTestUserDirect({ username: randomUsername() })),
      )
      await Promise.all(
        paginationTargets.map(t =>
          insertTestReportIntegrityFlag({
            reportedUserId: t!.id,
            reporterCount: 5,
          }),
        ),
      )

      const firstPage = await getReportIntegrityFlags({ limit: 2 })
      expect(firstPage.page_info.has_next_page).toBe(true)
      const cursor = firstPage.page_info.end_cursor
      expect(cursor).not.toBeNull()

      const secondPage = await getReportIntegrityFlags({ limit: 2, after: cursor! })
      expect(Array.isArray(secondPage.results)).toBe(true)
      // IDs should not overlap with first page
      const firstIds = new Set(firstPage.results.map(f => f.id))
      for (const flag of secondPage.results) {
        expect(firstIds.has(flag.id)).toBe(false)
      }
    }, 60_000)

    it('throws 400 for invalid cursor format', async () => {
      await expect(getReportIntegrityFlags({ after: 'not-a-valid-cursor' })).rejects.toThrow(
        'Invalid cursor format',
      )
    }, 60_000)

    it('accepts a legacy simple cursor continuation', async () => {
      const legacyTarget = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: legacyTarget.id,
        reporterCount: 6,
      })
      const result = await getReportIntegrityFlags({ after: encodeCursor({ id: flagId }) })
      expect(result.results.every(flag => flag.id < flagId)).toBe(true)
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
})
