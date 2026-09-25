import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import {
  copyrightStaffEmailIntakeQueueCursorScope,
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '@services/copyright-notices'

// Only this file writes copyright email intakes received about 1000 years from now. The staff email
// queue is global and oldest-first, so a test owns the queue tail only while no later intake exists:
// vitest runs these tests one at a time, and `reserveFarFutureRows` starts every test's intakes after
// those of every earlier test, in this run and in earlier runs against the same database.
const farFutureOffsetMs = 1000 * 365 * 24 * 60 * 60 * 1000
const otherCursorScope = 'copyright-notices:staff-queue:received-at-asc-id-asc'
const queuePath = '/api/v1/copyright-email-intakes/review-queue'
let lastReservedMs = 0

type QueuePage = {
  copyright_email_intakes: Array<{ id: string; received_at: string; review_path: string }>
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

describe('copyright email intake queue pagination', () => {
  it('ends on an exact-limit final page with no next cursor', async () => {
    const { ids, after } = await createOwnedIntakes(4)
    const request = await createModeratorRequest()

    const first = await getPage(request, { limit: 2, after })
    expect(first.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(0, 2))
    expect(first.page_info).toEqual({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
    const second = await getPage(request, { limit: 2, after: first.page_info.end_cursor! })
    expect(second.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(2))
    expect(second.page_info).toEqual({
      has_next_page: false,
      start_cursor: expect.any(String),
      end_cursor: null,
    })
  })

  it('ends on a partial final page', async () => {
    const { ids, after } = await createOwnedIntakes(4)
    const request = await createModeratorRequest()

    const first = await getPage(request, { limit: 3, after })
    expect(first.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(0, 3))
    expect(first.copyright_email_intakes[0]).toMatchObject({ review_path: 'initial' })
    const second = await getPage(request, { limit: 3, after: first.page_info.end_cursor! })
    expect(second.copyright_email_intakes.map(intake => intake.id)).toEqual(ids.slice(3))
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('walks every owned intake one page at a time without repeats', async () => {
    const { ids, after } = await createOwnedIntakes(4)
    const request = await createModeratorRequest()

    const walked: string[] = []
    let cursor: string | null = after
    for (let pageCount = 0; cursor && pageCount < ids.length + 1; pageCount += 1) {
      const page = await getPage(request, { limit: 1, after: cursor })
      walked.push(...page.copyright_email_intakes.map(intake => intake.id))
      cursor = page.page_info.end_cursor
    }
    expect(walked).toEqual(ids)
  })

  it('uses the UUID tie-breaker when two intakes share a received timestamp', async () => {
    const receivedAt = new Date(reserveFarFutureRows(1))
    const ids = [await createParsedIntake(receivedAt), await createParsedIntake(receivedAt)].sort()
    const request = await createModeratorRequest()

    const after = encodeScopedPreciseTimestampCursor(
      toPreciseTimestamp(receivedAt),
      ids[0]!,
      copyrightStaffEmailIntakeQueueCursorScope,
    )
    const page = await getPage(request, { limit: 1, after })
    expect(page.copyright_email_intakes.map(intake => intake.id)).toEqual([ids[1]])
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('rejects malformed and cross-scope cursors and a non-positive limit', async () => {
    const request = await createModeratorRequest()
    const wrongScope = encodeScopedPreciseTimestampCursor(
      '2026-01-01T00:00:00.000000Z',
      crypto.randomUUID(),
      otherCursorScope,
    )

    await request.get(`${queuePath}?after=${encodeURIComponent(wrongScope)}`).expect(400)
    await request.get(`${queuePath}?after=not-a-copyright-cursor`).expect(400)
    await request.get(`${queuePath}?limit=0`).expect(400)
  })
})

async function createOwnedIntakes(count: number): Promise<{ ids: string[]; after: string }> {
  const baseMs = reserveFarFutureRows(count)
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    ids.push(await createParsedIntake(new Date(baseMs + index)))
  }
  const after = encodeScopedPreciseTimestampCursor(
    toPreciseTimestamp(new Date(baseMs - 1)),
    crypto.randomUUID(),
    copyrightStaffEmailIntakeQueueCursorScope,
  )
  return { ids, after }
}

function reserveFarFutureRows(count: number): number {
  const baseMs = Math.max(Date.now() + farFutureOffsetMs, lastReservedMs + 1)
  lastReservedMs = baseMs + count - 1
  return baseMs
}

async function createParsedIntake(receivedAt: Date): Promise<string> {
  const sesMessageId = `ses-email-queue-page-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 8),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
    subject: 'Copyright complaint',
    bodyText: 'This is a copyright complaint.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  return intake.id
}

async function createModeratorRequest() {
  const request = createRequest()
  await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return request
}

async function getPage(
  request: Awaited<ReturnType<typeof createModeratorRequest>>,
  query: { limit: number; after: string },
): Promise<QueuePage> {
  const response = await request
    .get(`${queuePath}?limit=${query.limit}&after=${encodeURIComponent(query.after)}`)
    .expect(200)
  return response.body as QueuePage
}

function toPreciseTimestamp(date: Date): string {
  return date.toISOString().replace(/Z$/, '000Z')
}
