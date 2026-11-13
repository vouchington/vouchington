import {
  assertTerritorialInitialStaffCase,
  findQueuedCase,
} from '@voucha/test-helpers/copyright-territorial-reopening-projection'
import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { seedCommittedTerritorialAcknowledgment } from '@voucha/test-helpers/copyright-territorial-acknowledged-fixture'
import { assertTerritorialHttpDecisionOutcome } from '@voucha/test-helpers/copyright-territorial-http-decision-outcome'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { createRequest } from '@voucha/test-helpers/api/server'
import { describe, expect, it } from 'vitest'
import { createHostedImagePost } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  TERRITORIAL_SURFACES,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  readTerritorialDecisionReopeningFacts,
  readTerritorialDecisionReopeningQueueReasons,
  receiveTestTerritorialDecisionNotice,
} from '@voucha/test-helpers/territorial-decision-reopening'

describe.each(TERRITORIAL_SURFACES)('$label decision reopening', surface => {
  useCopyrightIntakeEnvironment()

  it.each(['initial', 'successor'] as const)(
    '%s decision HTTP writer commits complete scoped authority or a precise conflict stage',
    async phase => {
      expect.hasAssertions()
      const scene = await createTestTerritorialRestrictionScene(surface.jurisdiction)
      if (phase === 'successor') {
        await seedCommittedTerritorialDecision(surface.jurisdiction, scene.staff, scene.noticeId, {
          text: 'No restriction was warranted.',
          publicExplanation: 'The notice does not support restriction.',
          outcome: 'no_action',
          targets: [],
        })
        const complaint = await seedCommittedTerritorialRedress(
          surface.jurisdiction,
          scene.noticeId,
          scene.claimant,
          'Reconsider the initial decision.',
        )
        await seedCommittedTerritorialRedressDecision(
          surface.jurisdiction,
          scene.noticeId,
          complaint.id,
          scene.staff,
          { disposition: 'revoke', rationale: 'A fresh restriction review is warranted.' },
        )
      }
      const staff = createRequest()
      await staff.authenticateAs(scene.staff)
      await assertTerritorialHttpDecisionOutcome(
        surface.jurisdiction,
        scene,
        {
          text: 'Staff-only reason for the decision.',
          publicExplanation: 'Public explanation for the decision.',
          outcome: phase === 'initial' ? 'no_action' : 'restrict',
          targets: phase === 'initial' ? [] : scene.targets,
        },
        staff,
      )
    },
  )

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
    const acknowledgment = await seedCommittedTerritorialAcknowledgment(
      surface.jurisdiction,
      noticeId,
    )
    const initialQueueItem = await findQueuedCase(actors.staffRequest, noticeId)
    expect(initialQueueItem.reasons).toContain('territorial_notice_review')
    await assertTerritorialInitialStaffCase(
      surface.jurisdiction,
      notice,
      hostedUseUrl,
      acknowledgment,
    )
    const decisionUrl = `${surface.base}/${noticeId}/${surface.determinationPath}`
    const redressUrl = `${surface.base}/${noticeId}/redress-requests`

    await seedCommittedTerritorialDecision(surface.jurisdiction, actors.staff, noticeId, {
      text: 'The notice does not support a restriction.',
      publicExplanation: noActionExplanation,
      outcome: 'no_action',
      targets: [],
    })

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

    // UK staff record the externally received complaint; EU notifiers file their own complaint.
    const redress = await seedCommittedTerritorialRedress(
      surface.jurisdiction,
      noticeId,
      surface.jurisdiction === 'eu_dsa' ? actors.claimant : actors.staff,
      'Please reconsider the no-action decision.',
      surface.jurisdiction === 'eu_dsa' ? 'notifier' : 'reviewer',
    )
    const redressId = redress.id
    await seedCommittedTerritorialRedressDecision(
      surface.jurisdiction,
      noticeId,
      redressId,
      actors.staff,
      { disposition: 'revoke', rationale: 'Reopen for a fresh review.' },
    )

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
    await seedCommittedTerritorialDecision(
      surface.jurisdiction,
      actors.staff,
      neverRevokedNoticeId,
      {
        text: 'The evidence does not support restriction.',
        publicExplanation: 'No restriction is warranted on this notice.',
        outcome: 'no_action',
        targets: [],
      },
    )
    await actors.staffRequest
      .post(neverRevokedUrl)
      .send({
        [surface.determinationField]: 'Attempted successor before revoke.',
        public_explanation: 'This successor is not authorized.',
        outcome: 'restrict',
        targets: [target],
      })
      .expect(409)

    await seedCommittedTerritorialDecision(surface.jurisdiction, actors.staff, noticeId, {
      text: 'The post-image violates the applicable copyright law.',
      publicExplanation: explanation,
      outcome: 'restrict',
      targets: [
        { surfaceKind: 'post-image', postId: post.postId, imageId: post.imageId, hostedUseUrl },
      ],
    })

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
