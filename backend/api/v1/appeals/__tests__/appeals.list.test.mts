import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestPost,
  insertTestUserWarning,
  appendTestPlatformRejectionNote,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'

describe('GET /api/v1/appeals — list behavior', () => {
  let staff: PrivateUser
  let appellant: PrivateUser
  let otherAppellant: PrivateUser
  let appellantAppealIds: string[]
  let enrichedAppealId: string
  const internalWarningReason = `staff-only-warning-${crypto.randomUUID()}`
  const publicWarningMessage = `public-warning-${crypto.randomUUID()}`

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    appellant = await createTestUser()
    otherAppellant = await createTestUser()

    async function createWarningAppeal(
      user: PrivateUser,
      reason: string,
      warningOptions: { reason?: string; publicMessage?: string } = {},
    ) {
      const warning = await insertTestUserWarning({
        userId: user.id,
        issuedById: staff.id,
        reason: warningOptions.reason ?? 'spam',
        publicMessage: warningOptions.publicMessage,
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: reason,
      })
      return createModerationAppeal(user, input)
    }

    const [r1, r2] = await Promise.all([
      createWarningAppeal(appellant, `List test appeal ${crypto.randomUUID()}`, {
        reason: internalWarningReason,
        publicMessage: publicWarningMessage,
      }),
      createWarningAppeal(appellant, `List test appeal ${crypto.randomUUID()}`),
      createWarningAppeal(otherAppellant, `Other user appeal ${crypto.randomUUID()}`),
    ])
    appellantAppealIds = [r1.appeal.id, r2.appeal.id]
    enrichedAppealId = r1.appeal.id
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/appeals').expect(401)
  })

  it('staff sees all appeals (not scoped to own)', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get('/api/v1/appeals').expect(200)
    expect(response.body.appeals).toBeDefined()
    expect(Array.isArray(response.body.appeals)).toBe(true)
    // Staff should see appeals from multiple users
    const appellantIds = new Set(
      response.body.appeals.map((a: { appellant_id: string }) => a.appellant_id),
    )
    expect(appellantIds.size).toBeGreaterThan(1)

    const enrichedAppeal = response.body.appeals.find(
      (appeal: { id: string }) => appeal.id === enrichedAppealId,
    )
    expect(enrichedAppeal).toMatchObject({
      target_context: {
        type: 'warning',
        public_message: publicWarningMessage,
      },
      staff_context: {
        appellant: {
          id: appellant.id,
          profile_image_id: appellant.profile_image_id ?? null,
          verified_display_name: appellant.verified_display_name ?? null,
        },
        original_decision: {
          internal_reason: internalWarningReason,
          actor: {
            id: staff.id,
            profile_image_id: staff.profile_image_id ?? null,
            verified_display_name: staff.verified_display_name ?? null,
          },
        },
      },
    })
    expect(enrichedAppeal.target_context.created_at).toEqual(expect.any(String))
  })

  it('non-staff member only sees own appeals (redacted — no appellant_id field)', async () => {
    const request = createRequest()
    await request.authenticateAs(appellant)
    const response = await request.get('/api/v1/appeals').expect(200)
    expect(response.body.appeals).toBeDefined()
    // Non-staff responses are redacted: appellant_id is stripped, only own appeals returned
    const returnedIds = response.body.appeals.map((a: { id: string }) => a.id)
    for (const id of appellantAppealIds) {
      expect(returnedIds).toContain(id)
    }
    // Confirm appellant_id is not exposed in redacted response
    for (const appeal of response.body.appeals) {
      expect(appeal.appellant_id).toBeUndefined()
      expect(appeal.staff_context).toBeUndefined()
    }
    const rawJson = JSON.stringify(response.body)
    expect(rawJson).not.toContain(internalWarningReason)
    expect(rawJson).toContain(publicWarningMessage)
    const enrichedAppeal = response.body.appeals.find(
      (appeal: { id: string }) => appeal.id === enrichedAppealId,
    )
    expect(Object.keys(enrichedAppeal.target_context).sort()).toEqual([
      'community',
      'created_at',
      'id',
      'public_message',
      'type',
    ])
  })

  it('never exposes an internal platform-removal note to the appellant', async () => {
    const internalRemovalNote = `staff-only-removal-${crypto.randomUUID()}`
    const postId = await insertTestPost({
      title: `Removed post ${crypto.randomUUID()}`,
      slug: `removed-post-${crypto.randomUUID()}`,
      createdById: appellant.id,
      markdown: 'Removed content',
      clearanceStatus: 'rejected',
    })
    await appendTestPlatformRejectionNote(postId, internalRemovalNote)
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: 'Please review this removal.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)

    const request = createRequest()
    await request.authenticateAs(appellant)
    const response = await request.get('/api/v1/appeals').expect(200)
    const returnedAppeal = response.body.appeals.find(
      (candidate: { id: string }) => candidate.id === appeal.id,
    )

    expect(returnedAppeal.target_context).toMatchObject({
      type: 'post_removal',
      kind: 'platform',
      public_reason: null,
    })
    expect(JSON.stringify(returnedAppeal)).not.toContain(internalRemovalNote)
  })

  it('staff with mine=true only sees own appeals', async () => {
    // Create a staff appeal to have something to check
    const staffWarning = await insertTestUserWarning({
      userId: staff.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const staffInput = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: staffWarning.id,
      appeal_reason: `Staff own appeal ${crypto.randomUUID()}`,
    })
    const { appeal: staffAppeal } = await createModerationAppeal(staff, staffInput)

    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get('/api/v1/appeals?mine=true').expect(200)
    const returnedIds = response.body.appeals.map((a: { id: string }) => a.id)
    expect(returnedIds).toContain(staffAppeal.id)
    // All returned appeals must belong to staff
    for (const appeal of response.body.appeals) {
      expect(appeal.appellant_id).toBe(staff.id)
    }
  })

  it('returns page_info structure', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get('/api/v1/appeals').expect(200)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
  })

  it('respects limit query param', async () => {
    const request = createRequest()
    await request.authenticateAs(staff)
    const response = await request.get('/api/v1/appeals?limit=1').expect(200)
    expect(response.body.appeals.length).toBeLessThanOrEqual(1)
  })

  it('after pagination: second page excludes first page results', async () => {
    const paginationUser = await createTestUser()

    async function createPaginationAppeal(reason: string) {
      const warning = await insertTestUserWarning({
        userId: paginationUser.id,
        issuedById: staff.id,
        reason: 'spam',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: reason,
      })
      return createModerationAppeal(paginationUser, input)
    }

    // Create 3 appeals for a fresh user so limit=2 guarantees a second page
    const [ra, rb, rc] = await Promise.all([
      createPaginationAppeal(`Cursor test A ${crypto.randomUUID()}`),
      createPaginationAppeal(`Cursor test B ${crypto.randomUUID()}`),
      createPaginationAppeal(`Cursor test C ${crypto.randomUUID()}`),
    ])
    const allCreatedIds = [ra.appeal.id, rb.appeal.id, rc.appeal.id]

    // Non-staff: sees only own appeals
    const paginationRequest = createRequest()
    await paginationRequest.authenticateAs(paginationUser)

    // Fetch first page with limit=2 — fresh user with 3 appeals guarantees has_next_page
    const page1 = await paginationRequest.get('/api/v1/appeals?limit=2').expect(200)
    const page1Ids: string[] = page1.body.appeals.map((a: { id: string }) => a.id)
    const endCursor: string = page1.body.page_info.end_cursor

    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.start_cursor).toEqual(expect.any(String))
    expect(endCursor).toBeTruthy()

    await paginationRequest
      .get(`/api/v1/appeals?limit=2&status=dismissed&after=${encodeURIComponent(endCursor)}`)
      .expect(400)

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherAppellant)
    await otherRequest
      .get(`/api/v1/appeals?limit=2&after=${encodeURIComponent(endCursor)}`)
      .expect(400)

    // Fetch the second page using the opaque continuation cursor.
    const page2 = await paginationRequest
      .get(`/api/v1/appeals?limit=2&after=${encodeURIComponent(endCursor)}`)
      .expect(200)
    const page2Ids: string[] = page2.body.appeals.map((a: { id: string }) => a.id)

    // Pages must not overlap
    expect(page2Ids.some(id => page1Ids.includes(id))).toBe(false)
    // Combined pages must include all created appeals
    const combined = [...page1Ids, ...page2Ids]
    for (const id of allCreatedIds) {
      expect(combined).toContain(id)
    }
  })
})
