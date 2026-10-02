import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  encodeScopedPreciseTimestampCursor,
  encodeScopedTierPreciseUuidCursor,
} from '@modules/pagination'
import {
  readCopyrightStaffQueueCursorBefore,
  readCopyrightStaffQueueCursorRows,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createCopyrightFormIntake } from '@services/copyright-notices'
import { copyrightStaffQueueCursorScope } from '@services/copyright-notices/read-models-staff'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const otherCursorScope = 'copyright-notices:accepted-at-desc-id-desc'
// The pre-urgency `(received_at, id)` scope a stale client may still hold.
const receivedAtCursorScope = 'copyright-notices:staff-queue:received-at-asc-id-asc'

describe('copyright staff queue pagination', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('continues actionable cases without repeats and rejects malformed or cross-scope cursors', async () => {
    const fixture = await createCopyrightFormFixture()
    const target = fixture.form.targets[0]!
    const created = await Promise.all(
      Array.from({ length: 102 }, async () => {
        const { intake } = await createCopyrightFormIntake({
          requesterUserId: null,
          requesterIdentity: `guest:${crypto.randomUUID()}`,
          idempotencyKey: crypto.randomUUID(),
          request: {
            jurisdiction: 'us_dmca',
            claimantDisplayName: 'Guest claimant',
            claimantContact: `claimant-${crypto.randomUUID()}@example.test`,
            claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
            workDescription: 'A photograph owned by the guest claimant.',
            goodFaithBelief: true,
            accuracyAuthorityUnderPenaltyOfPerjury: true,
            electronicSignature: 'Guest claimant',
            claimantTargets: [
              {
                postId: target.post_id,
                imageId: target.image_id,
                hostedUseUrl: target.target_url,
              },
            ],
          },
        })
        return intake.copyright_notice_id
      }),
    )
    const firstCursor = await readCopyrightStaffQueueCursorBefore(created)
    const request = createRequest()
    await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))

    let page = await request
      .get(
        `/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(firstCursor)}`,
      )
      .expect(200)
    expect(page.body.copyright_notices.length).toBeGreaterThan(0)
    expect(page.body.copyright_notices.length).toBeLessThanOrEqual(100)
    expect(page.body.page_info).toMatchObject({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
    const pagedIds: string[] = []
    for (let pageCount = 0; pageCount < 10; pageCount += 1) {
      pagedIds.push(...page.body.copyright_notices.map((notice: { id: string }) => notice.id))
      if (created.every(id => pagedIds.includes(id))) break
      const after = page.body.page_info.end_cursor as string | null
      if (!page.body.page_info.has_next_page || !after) break
      page = await request
        .get(`/api/v1/copyright-notices/review-queue?limit=100&after=${encodeURIComponent(after)}`)
        .expect(200)
    }
    expect(new Set(pagedIds).size).toBe(pagedIds.length)
    for (const id of created) expect(pagedIds).toContain(id)

    const wrongScope = encodeScopedPreciseTimestampCursor(
      '2026-01-01T00:00:00.000000Z',
      crypto.randomUUID(),
      otherCursorScope,
    )
    await request
      .get(`/api/v1/copyright-notices/review-queue?after=${encodeURIComponent(wrongScope)}`)
      .expect(400)
    await request
      .get('/api/v1/copyright-notices/review-queue?after=not-a-copyright-cursor')
      .expect(400)
    const staleReceivedAtCursor = encodeScopedPreciseTimestampCursor(
      '2026-01-01T00:00:00.000000Z',
      created[0]!,
      receivedAtCursorScope,
    )
    await request
      .get(
        `/api/v1/copyright-notices/review-queue?after=${encodeURIComponent(staleReceivedAtCursor)}`,
      )
      .expect(400)
    const unknownTier = encodeScopedTierPreciseUuidCursor(
      '2026-01-01T00:00:00.000000Z',
      3,
      created[0]!,
      copyrightStaffQueueCursorScope,
    )
    await request
      .get(`/api/v1/copyright-notices/review-queue?after=${encodeURIComponent(unknownTier)}`)
      .expect(400)
  })

  it('uses the UUID tie-breaker when two staff cases have the same received timestamp', async () => {
    const fixture = await createCopyrightFormFixture()
    const target = fixture.form.targets[0]!
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date())
    try {
      const create = () =>
        createCopyrightFormIntake({
          requesterUserId: null,
          requesterIdentity: `guest:${crypto.randomUUID()}`,
          idempotencyKey: crypto.randomUUID(),
          request: {
            jurisdiction: 'us_dmca',
            claimantDisplayName: 'Guest claimant',
            claimantContact: `claimant-${crypto.randomUUID()}@example.test`,
            claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
            workDescription: 'A photograph owned by the guest claimant.',
            goodFaithBelief: true,
            accuracyAuthorityUnderPenaltyOfPerjury: true,
            electronicSignature: 'Guest claimant',
            claimantTargets: [
              { postId: target.post_id, imageId: target.image_id, hostedUseUrl: target.target_url },
            ],
          },
        })
      const first = await create()
      const second = await create()
      const rows = await readCopyrightStaffQueueCursorRows([
        first.intake.copyright_notice_id,
        second.intake.copyright_notice_id,
      ])
      expect(rows[0]).toMatchObject({ urgency: 2, waiting_since: rows[1]!.waiting_since })
      const request = createRequest()
      await request.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
      const after = encodeScopedTierPreciseUuidCursor(
        rows[0]!.waiting_since,
        rows[0]!.urgency,
        rows[0]!.id,
        copyrightStaffQueueCursorScope,
      )
      const response = await request
        .get(`/api/v1/copyright-notices/review-queue?limit=1&after=${encodeURIComponent(after)}`)
        .expect(200)
      expect(response.body.copyright_notices[0]).toMatchObject({ id: rows[1]!.id })
    } finally {
      vi.useRealTimers()
    }
  })
})
