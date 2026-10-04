import { describe, expect, it } from 'vitest'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  TERRITORIAL_SURFACES,
  type TerritorialActors,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  readTerritorialDecisionReopeningFacts,
  readTerritorialDecisionReopeningQueueReasons,
  receiveTestTerritorialDecisionNotice,
} from '@voucha/test-helpers/territorial-decision-reopening'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightStaffCase } from '@voucha/test-helpers/services/copyright-notices/staff-case'
import {
  acknowledgeEuCopyrightNotice,
  acknowledgeUkCopyrightNotice,
} from '@services/copyright-notices'

const queuePath = '/api/v1/copyright-notices/review-queue'

type QueueResponse = {
  copyright_notices: Array<{ id: string; reasons: string[] }>
}

describe.each(TERRITORIAL_SURFACES)('$label decision reopening', surface => {
  useCopyrightIntakeEnvironment()

  it('reopens no_action for a restricting successor without carrying over its revocation', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const post = await createHostedImagePost('public')
    const hostedUseUrl = `https://voucha.ai/posts/${post.postId}`
    const target = {
      surface: 'post-image',
      post_id: post.postId,
      image_id: post.imageId,
      target_url: hostedUseUrl,
    }
    const noActionExplanation = `The notice does not identify a basis for restricting the target.`
    const explanation = `Territorial decision explanation ${crypto.randomUUID()}`
    const notice = await receiveTestTerritorialDecisionNotice(
      surface.jurisdiction,
      actors.claimant,
      hostedUseUrl,
    )
    const noticeId = notice.noticeId
    const acknowledgment =
      surface.jurisdiction === 'eu_dsa'
        ? await acknowledgeEuCopyrightNotice(actors.claimant, noticeId)
        : await acknowledgeUkCopyrightNotice(actors.claimant, noticeId)
    const initialQueueItem = await findQueuedCase(actors.staffRequest, noticeId)
    expect(initialQueueItem.reasons).toContain('territorial_notice_review')
    const staffCase = await readTestCopyrightStaffCase(noticeId)
    expect(staffCase).toMatchObject({
      id: noticeId,
      jurisdiction: surface.jurisdiction,
      claimant: { contact: notice.contact },
      work_description: notice.contentDescription,
      form_review: null,
      targets: [],
      evidence: [],
      restrictions: [],
      appeals: [],
      counter_notices: [],
      legal_holds: [],
      action_intents: [],
      delivery_intents: [],
      staydown_matches: [],
      email_correspondence: [],
      territorial: {
        hosted_use_url: hostedUseUrl,
        grounds: notice.grounds,
        acknowledgment: {
          attempt_count: acknowledgment.attempt_count,
          acknowledged_at: acknowledgment.acknowledged_at,
          escalated: false,
        },
        reopened_at: null,
        decision: null,
      },
    })
    expect(staffCase?.territorial?.acknowledgment.acknowledged_at).toEqual(
      acknowledgment.acknowledged_at,
    )
    const decisionUrl = `${surface.base}/${noticeId}/${surface.determinationPath}`
    const redressUrl = `${surface.base}/${noticeId}/redress-requests`

    await actors.staffRequest
      .post(decisionUrl)
      .send({
        [surface.determinationField]: 'The notice does not support a restriction.',
        public_explanation: noActionExplanation,
        outcome: 'no_action',
      })
      .expect(201)

    expect(await readTerritorialDecisionReopeningQueueReasons(noticeId)).not.toContain(
      'territorial_notice_review',
    )

    const noActionFacts = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(noActionFacts.decisions).toHaveLength(1)
    expect(noActionFacts.decisions[0]).toMatchObject({
      outcome: 'no_action',
      assessment_id: null,
      supersedes_decision_id: null,
    })
    expect(noActionFacts).toMatchObject({
      submission_count: 0,
      assessment_count: 0,
      target_count: 0,
      restrictions: [],
      withhold_intent_count: 0,
      restore_intent_count: 0,
      operative_incident_count: 0,
    })
    expect(noActionFacts.messages.some(message => message.recipient_role === 'poster')).toBe(false)
    expect(
      noActionFacts.messages.some(
        message =>
          message.delivery_kind === 'claimant_decision_notice' &&
          message.recipient_user_id === actors.claimant.id &&
          message.text.includes(noActionExplanation),
      ),
    ).toBe(true)

    const redressResponse = await actors.claimantRequest
      .post(redressUrl)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ explanation: 'Please reconsider the no-action decision.' })
      .expect(201)
    const redressId = redressResponse.body[surface.redressField].id as string
    await actors.staffRequest
      .post(`${redressUrl}/${redressId}/decisions`)
      .send({ staff_disposition: 'revoke', rationale: 'Reopen for a fresh review.' })
      .expect(201)

    const reopenedItem = await findQueuedCase(actors.staffRequest, noticeId)
    expect(reopenedItem.reasons).toContain('territorial_decision_reopened')
    expect(reopenedItem.reasons).not.toContain('territorial_notice_review')
    const reopenedFacts = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(reopenedFacts.restore_intent_count).toBe(0)

    await actors.staffRequest
      .post(decisionUrl)
      .send({
        [surface.determinationField]: 'A reopened notice requires a restriction decision.',
        public_explanation: 'The complaint reopened this notice for review.',
        outcome: 'no_action',
      })
      .expect(422)

    const neverRevokedNotice = await receiveTestTerritorialDecisionNotice(
      surface.jurisdiction,
      actors.claimant,
      hostedUseUrl,
    )
    const neverRevokedNoticeId = neverRevokedNotice.noticeId
    const neverRevokedUrl = `${surface.base}/${neverRevokedNoticeId}/${surface.determinationPath}`
    await actors.staffRequest
      .post(neverRevokedUrl)
      .send({
        [surface.determinationField]: 'The evidence does not support restriction.',
        public_explanation: 'No restriction is warranted on this notice.',
        outcome: 'no_action',
      })
      .expect(201)
    await actors.staffRequest
      .post(neverRevokedUrl)
      .send({
        [surface.determinationField]: 'Attempted successor before revoke.',
        public_explanation: 'This successor is not authorized.',
        outcome: 'restrict',
        targets: [target],
      })
      .expect(409)

    await actors.staffRequest
      .post(decisionUrl)
      .send({
        [surface.determinationField]: 'The post-image violates the applicable copyright law.',
        public_explanation: explanation,
        outcome: 'restrict',
        targets: [target],
      })
      .expect(201)

    expect(await readTerritorialDecisionReopeningQueueReasons(noticeId)).not.toContain(
      'territorial_decision_reopened',
    )

    const restrictedFacts = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(restrictedFacts.decisions).toHaveLength(2)
    expect(restrictedFacts.decisions[1]).toMatchObject({
      outcome: 'restrict',
      supersedes_decision_id: restrictedFacts.decisions[0]?.id,
    })
    expect(restrictedFacts.decisions[1]?.assessment_id).toEqual(expect.any(String))
    expect(restrictedFacts).toMatchObject({
      submission_count: 1,
      assessment_count: 1,
      target_count: 1,
      withhold_intent_count: 1,
      restore_intent_count: 0,
      operative_incident_count: 1,
    })
    expect(restrictedFacts.restrictions).toHaveLength(1)
    expect(restrictedFacts.restrictions[0]).toMatchObject({
      lifted_at: null,
      human_review_action: 'confirm',
    })
    expect(
      restrictedFacts.messages.some(
        message =>
          message.delivery_kind === 'poster_restriction_notice' &&
          message.recipient_role === 'poster' &&
          message.recipient_user_id === post.poster.id &&
          message.channel === 'in_app' &&
          message.text.includes(explanation),
      ),
    ).toBe(true)
    expect(
      restrictedFacts.messages.some(
        message =>
          message.delivery_kind === 'poster_restriction_notice' &&
          message.recipient_role === 'poster' &&
          message.recipient_user_id === post.poster.id &&
          message.channel === 'email' &&
          message.text.includes(explanation),
      ),
    ).toBe(true)
    expect(
      restrictedFacts.messages.some(
        message =>
          message.delivery_kind === 'claimant_decision_notice' &&
          message.recipient_role === 'claimant' &&
          message.text.includes(explanation),
      ),
    ).toBe(true)

    await actors.staffRequest
      .post(decisionUrl)
      .send({
        [surface.determinationField]: 'A second successor is not allowed.',
        public_explanation: 'This second successor is not authorized.',
        outcome: 'restrict',
        targets: [target],
      })
      .expect(409)
    await actors.staffRequest
      .post(`${redressUrl}/${redressId}/decisions`)
      .send({
        staff_disposition: 'maintain',
        rationale: 'A superseded request cannot decide again.',
      })
      .expect(409)

    const finalFacts = await readTerritorialDecisionReopeningFacts(noticeId)
    expect(finalFacts.decisions).toHaveLength(2)
    expect(finalFacts.restrictions[0]?.lifted_at).toBeNull()
    expect(finalFacts.restore_intent_count).toBe(0)
    expect(finalFacts.operative_incident_count).toBe(1)
  })
})

async function findQueuedCase(
  request: TerritorialActors['staffRequest'],
  noticeId: string,
): Promise<{ id: string; reasons: string[] }> {
  let after = await readCopyrightStaffQueueCursorBefore([noticeId])
  for (;;) {
    const response = await request
      .get(`${queuePath}?limit=100&after=${encodeURIComponent(after)}`)
      .expect(200)
    const page = response.body as QueueResponse & {
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    const item = page.copyright_notices.find(candidate => candidate.id === noticeId)
    if (item) return item
    if (!page.page_info.has_next_page || !page.page_info.end_cursor) {
      throw new Error(`Territorial notice ${noticeId} is not queued`)
    }
    after = page.page_info.end_cursor
  }
}
