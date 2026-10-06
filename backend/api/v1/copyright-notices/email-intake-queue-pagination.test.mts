import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import { listCopyrightStaffEmailIntakePage } from '@services/copyright-notices/copyright-email-intake-page'
import { copyrightStaffEmailIntakeQueueCursorScope } from '@services/copyright-notices/read-models-staff-email-intakes'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'

const otherCursorScope = 'copyright-notices:staff-queue:received-at-asc-id-asc'
const queuePath = '/api/v1/copyright-email-intakes/review-queue'

describe('copyright email intake queue pagination', () => {
  it('ends on an exact-limit final page with no next cursor', async () => {
    const { ids, after, moderator } = await createOwnedIntakes(4)
    const first = await listCopyrightStaffEmailIntakePage(moderator, {
      limit: 2,
      after,
      intakeIds: ids,
    })
    expect(first.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(0, 2))
    expect(first.page_info).toEqual({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
    const second = await listCopyrightStaffEmailIntakePage(moderator, {
      limit: 2,
      after: first.page_info.end_cursor!,
      intakeIds: ids,
    })
    expect(second.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(2))
    expect(second.page_info).toEqual({
      has_next_page: false,
      start_cursor: expect.any(String),
      end_cursor: null,
    })
  })

  it('ends on a partial final page', async () => {
    const { ids, after, moderator } = await createOwnedIntakes(4)
    const first = await listCopyrightStaffEmailIntakePage(moderator, {
      limit: 3,
      after,
      intakeIds: ids,
    })
    expect(first.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(0, 3))
    expect(first.copyright_email_intakes[0]).toMatchObject({ review_path: 'initial' })
    const second = await listCopyrightStaffEmailIntakePage(moderator, {
      limit: 3,
      after: first.page_info.end_cursor!,
      intakeIds: ids,
    })
    expect(second.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(3))
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('walks every owned intake one page at a time without repeats', async () => {
    const { ids, after, foreignId, moderator } = await createOwnedIntakes(4)
    const walked: string[] = []
    let cursor: string | null = after
    for (let pageCount = 0; cursor && pageCount < ids.length + 1; pageCount += 1) {
      const page = await listCopyrightStaffEmailIntakePage(moderator, {
        limit: 1,
        after: cursor,
        intakeIds: ids,
      })
      walked.push(...page.copyright_email_intakes.map(intake => intake.id))
      cursor = page.page_info.end_cursor
    }
    expect(walked).toEqual(ids)
    expect(new Set(walked).size).toBe(walked.length)
    expect(walked).not.toContain(foreignId)
  })

  it('uses the UUID tie-breaker when two intakes share a received timestamp', async () => {
    const moderator = await createModerator()
    const receivedAt = new Date()
    const foreignId = await createParsedIntake(receivedAt)
    const ids = [
      await createParsedIntake(receivedAt),
      await createParsedIntake(receivedAt),
    ].toSorted()
    const after = encodeScopedPreciseTimestampCursor(
      toPreciseTimestamp(receivedAt),
      ids[0]!,
      copyrightStaffEmailIntakeQueueCursorScope,
    )
    const page = await listCopyrightStaffEmailIntakePage(moderator, {
      limit: 1,
      after,
      intakeIds: ids,
    })
    expect(page.copyright_email_intakes.map(intake => intake.id)).toEqual([ids[1]])
    expect(page.copyright_email_intakes.map(intake => intake.id)).not.toContain(foreignId)
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('rejects malformed and cross-scope cursors and a non-positive limit', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const wrongScope = encodeScopedPreciseTimestampCursor(
      '2026-01-01T00:00:00.000000Z',
      crypto.randomUUID(),
      otherCursorScope,
    )

    const malformed = await request.get(`${queuePath}?after=not-a-copyright-cursor`)
    expect(malformed.status).toBe(400)
    expect(malformed.headers['cache-control']).toBe('private, no-store')
    await request.get(`${queuePath}?after=${encodeURIComponent(wrongScope)}`).expect(400)
    await request.get(`${queuePath}?limit=0`).expect(400)
  })
})

async function createOwnedIntakes(count: number): Promise<{
  ids: string[]
  after: string
  foreignId: string
  moderator: PrivateUser
}> {
  const baseMs = Date.now()
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    ids.push(await createParsedIntake(new Date(baseMs + index * 2)))
  }
  const foreignId = await createParsedIntake(new Date(baseMs + 1))
  const after = encodeScopedPreciseTimestampCursor(
    toPreciseTimestamp(new Date(baseMs - 1)),
    crypto.randomUUID(),
    copyrightStaffEmailIntakeQueueCursorScope,
  )
  return { ids, after, foreignId, moderator: await createModerator() }
}

async function createParsedIntake(receivedAt: Date): Promise<string> {
  const intake = await createParsedCopyrightEmailIntake(receivedAt)
  return intake.id
}

async function createModerator(): Promise<PrivateUser> {
  return createTestUser({ extraRoles: ['moderator'] })
}

function toPreciseTimestamp(date: Date): string {
  return date.toISOString().replace(/Z$/, '000Z')
}
