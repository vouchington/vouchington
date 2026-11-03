import { describe, expect, it } from 'vitest'
import { encodeScopedAliasCursor } from '@modules/pagination'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestEuParticipantCase,
  readStaffTerritorialCard,
} from '@voucha/test-helpers/copyright-eu-participant-cases'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { territorialRecipientCursorScope } from './read-models-staff-territorial-recipients.mts'
import {
  listCopyrightTerritorialRecipients,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  submitEuCopyrightRedress,
} from './index.mts'

describe('territorial complaint collection', () => {
  useCopyrightIntakeEnvironment()

  it('pages reviewer complaints and refuses an old decision cursor after reopening', async () => {
    const scene = await createTestEuParticipantCase('no_action')
    const noticeId = scene.receipt.notice_id
    const expected: string[] = []
    for (let index = 0; index < 27; index++) {
      const reviewer = await createTestUser({ extraRoles: ['moderator'] })
      const request = await submitEuCopyrightRedress(
        reviewer,
        noticeId,
        crypto.randomUUID(),
        `Reviewer complaint ${index} ${scene.suffix}`,
      )
      expected.push(request.id)
    }
    const staff = createRequest()
    await staff.authenticateAs(scene.staff)
    const endpoint = `/api/v1/copyright-notices/${noticeId}/territorial-complaints`
    const first = await staff.get(endpoint).expect(200)
    expect(first.body.copyright_territorial_complaints).toHaveLength(25)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.copyright_territorial_complaints[0]).toMatchObject({
      filed_by: 'reviewer',
      informed_at: null,
      window_ends_at: null,
    })
    const rest = await staff
      .get(endpoint)
      .query({ after: first.body.page_info.end_cursor })
      .expect(200)
    expect(rest.body.copyright_territorial_complaints).toHaveLength(2)
    expect(rest.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const ids = [
      ...first.body.copyright_territorial_complaints,
      ...rest.body.copyright_territorial_complaints,
    ].map((row: { id: string }) => row.id)
    expect(ids).toEqual(expected.toSorted())
    expect(new Set(ids).size).toBe(27)

    const notifier = await submitEuCopyrightRedress(
      scene.notifier,
      noticeId,
      crypto.randomUUID(),
      `Notifier complaint ${scene.suffix}`,
    )
    await recordEuCopyrightRedressDecision(scene.staff, noticeId, notifier.id, {
      disposition: 'revoke',
      rationale: `Review agreed ${scene.suffix}`,
    })
    await recordEuCopyrightStatementOfReasons(scene.staff, noticeId, {
      text: `Successor internal rationale ${scene.suffix}`,
      publicExplanation: `Successor public explanation ${scene.suffix}`,
      outcome: 'restrict',
      targets: [
        {
          surfaceKind: 'post-image',
          postId: scene.postId,
          imageId: scene.imageId,
          hostedUseUrl: `https://example.test/work/${scene.suffix}`,
        },
      ],
    })
    const successor = await staff.get(endpoint).expect(200)
    expect(successor.body.copyright_territorial_complaints).toEqual([])
    expect(successor.body.page_info.has_next_page).toBe(false)
    await staff.get(endpoint).query({ after: first.body.page_info.end_cursor }).expect(400)
  })
})

describe('territorial recipients and queue counts', () => {
  useCopyrightIntakeEnvironment()

  it('pages the live decision recipients by role and counts complaints on the queue card', async () => {
    const scene = await createTestEuParticipantCase('restrict')
    const noticeId = scene.receipt.notice_id
    await submitEuCopyrightRedress(
      scene.notifier,
      noticeId,
      crypto.randomUUID(),
      `Notifier complaint ${scene.suffix}`,
    )
    const staff = createRequest()
    await staff.authenticateAs(scene.staff)

    const endpoint = `/api/v1/copyright-notices/${noticeId}/territorial-recipients`
    const page = await staff.get(endpoint).expect(200)
    const roles = page.body.copyright_territorial_recipients.map(
      (row: { role: string }) => row.role,
    )
    expect(roles).toEqual(['claimant', 'poster'])
    expect(page.body.copyright_territorial_recipients[0].user_id).toBe(scene.notifier.id)
    expect(page.body.page_info.has_next_page).toBe(false)
    await staff.get(endpoint).query({ after: 'not-a-cursor' }).expect(400)

    const card = await readStaffTerritorialCard(noticeId)
    expect(card).toMatchObject({ complaint_count: 1, dispute_settlement_count: 0 })
    expect(card).not.toHaveProperty('recipients')
    expect(card).not.toHaveProperty('complaints')
  })
})

describe('territorial recipient cursor walk', () => {
  useCopyrightIntakeEnvironment()

  it('walks every recipient one at a time and accepts a guest-poster cursor', async () => {
    const scene = await createTestEuParticipantCase('restrict', { extraPosts: 1 })
    const noticeId = scene.receipt.notice_id
    const posters = [scene.poster.id, ...scene.extraPosts.map(extra => extra.poster.id)].toSorted()
    const walked: Array<{ role: string; user_id: string | null }> = []
    let after: string | undefined
    for (let guard = 0; guard < 6; guard++) {
      const page = await listCopyrightTerritorialRecipients(scene.staff, noticeId, {
        limit: 1,
        after,
      })
      walked.push(...page.results)
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(walked.map(row => [row.role, row.user_id])).toEqual([
      ['claimant', scene.notifier.id],
      ['poster', posters[0]],
      ['poster', posters[1]],
    ])

    // A guest poster has no account, so its alias ends in a colon and sorts before any account.
    const decisionId = await liveDecisionId(noticeId)
    const guestCursor = encodeScopedAliasCursor(
      'poster:',
      territorialRecipientCursorScope(noticeId, decisionId),
    )
    const afterGuest = await listCopyrightTerritorialRecipients(scene.staff, noticeId, {
      limit: 5,
      after: guestCursor,
    })
    expect(afterGuest.results.map(row => row.user_id)).toEqual(posters)
  })
})

async function liveDecisionId(noticeId: string): Promise<string> {
  return (await readStaffTerritorialCard(noticeId))!.decision!.id
}
