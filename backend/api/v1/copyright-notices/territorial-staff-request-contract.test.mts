import { malformedTerritorialTargetBodies } from '@voucha/test-helpers/copyright-territorial-malformed-targets'
import {
  assertApiTerritorialAcknowledgmentFailure,
  assertApiNoActionRedressDecision,
} from '@voucha/test-helpers/copyright-api-territorial-staff-writes'
import { readCopyrightApiTerritorialState } from '@voucha/test-helpers/copyright-api-territorial-request-outcomes'
import { readTerritorialReviewState } from '@voucha/test-helpers/copyright-territorial-review-state'
import { seedCommittedTerritorialRedressDecision } from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { readTerritorialDecisionState } from '@voucha/test-helpers/copyright-territorial-decision-state'
import { assertTerritorialHttpDecisionOutcome } from '@voucha/test-helpers/copyright-territorial-http-decision-outcome'
import { createRequest } from '@voucha/test-helpers/api/server'
import { describe, expect, it } from 'vitest'
import { readCopyrightTerritorialContractShape } from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  seedTerritorialRedress,
  seedDeterminedTerritorialNoticeForValidation,
} from '@voucha/test-helpers/copyright-territorial-redress-seed'
import {
  TERRITORIAL_SURFACES,
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

// A caller the handler turns away answers with a bare status, never a schema diagnostic.
const SCHEMA_DIAGNOSTIC = /schema|must be|required|invalid/i

describe.each(TERRITORIAL_SURFACES)('$label staff request contracts', surface => {
  useCopyrightIntakeEnvironment()

  describe('acknowledgment failures', () => {
    it('keeps 401 and 403 ahead of the path check', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/not-a-uuid/acknowledgment-failures`

      const anonymous = await anonymousRequest.post(url).expect(401)
      expect(anonymous.body.message).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).expect(403)
    })

    it('rejects a malformed id, then records the failure for a real notice', async () => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const noticeId = await seedPendingTerritorialNotice(surface.jurisdiction, actors.claimant)

      const before = await readCopyrightApiTerritorialState(noticeId)
      await actors.staffRequest
        .post(`${surface.base}/not-a-uuid/acknowledgment-failures`)
        .expect(422)
      expect(await readCopyrightApiTerritorialState(noticeId)).toEqual(before)
      await assertApiTerritorialAcknowledgmentFailure(
        actors.staffRequest,
        surface.jurisdiction,
        noticeId,
      )
    })
  })

  describe('reasons', () => {
    const decisionBody = (overrides: Record<string, unknown> = {}) =>
      territorialDecisionBody(surface, overrides)

    it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`

      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.body.message).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).send({ injected: true }).expect(403)
    })

    it('rejects an unknown key before recording the reasons', async () => {
      const scene = await createTestTerritorialRestrictionScene(surface.jurisdiction)
      const staffRequest = createRequest()
      await staffRequest.authenticateAs(scene.staff)
      const noticeId = scene.noticeId
      const url = `${surface.base}/${noticeId}/${surface.determinationPath}`
      const body = territorialDecisionBody(surface)
      const before = await readTerritorialDecisionState(surface.jurisdiction, scene)
      await staffRequest
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(await readTerritorialDecisionState(surface.jurisdiction, scene)).toEqual(before)
      expect(
        (await readCopyrightTerritorialContractShape(noticeId))[surface.determinationCount],
      ).toBe(0)
      await assertTerritorialHttpDecisionOutcome(
        surface.jurisdiction,
        scene,
        {
          text: 'Staff internal rationale',
          publicExplanation: 'The identified post-image is unavailable in this territory.',
          outcome: 'no_action',
          targets: [],
        },
        staffRequest,
      )
    })

    it.each([
      ['missing public_explanation', { public_explanation: undefined }],
      ['blank public_explanation', { public_explanation: '   ' }],
      ['non-string public_explanation', { public_explanation: 7 }],
      ['overlong public_explanation', { public_explanation: 'x'.repeat(2_001) }],
      ['missing outcome', { outcome: undefined }],
      ['unknown outcome', { outcome: 'dismiss' }],
    ])('rejects %s before service lookup', async (_label, override) => {
      const { staffRequest } = await createTerritorialActors()
      const rejected = await staffRequest
        .post(`${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`)
        .send(decisionBody(override))
        .expect(422)
      expect(rejected.body.message).not.toMatch(/not found/i)
    })

    it.each(malformedTerritorialTargetBodies())(
      'rejects %s before service lookup',
      async (_label, override) => {
        const { staffRequest } = await createTerritorialActors()
        const rejected = await staffRequest
          .post(`${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`)
          .send(decisionBody(override))
          .expect(422)
        expect(rejected.body.message).not.toMatch(/not found/i)
      },
    )

    // The service decides existence, so a missing notice is a 404 for a valid body only.
    it('leaves the missing-notice 404 to the service behind a malformed body', async () => {
      const { staffRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`
      const body = territorialDecisionBody(surface)

      await staffRequest.post(url).send(body).expect(404)
      await staffRequest
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
    })

    it('keeps the field message and the path id check', async () => {
      const { staffRequest } = await createTerritorialActors()
      const field = surface.determinationField

      const rejected = await staffRequest
        .post(`${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`)
        .send(territorialDecisionBody(surface, { [field]: 7 }))
        .expect(422)
      expect(rejected.body.message).toBe(`${field} is required`)
      await staffRequest
        .post(`${surface.base}/not-a-uuid/${surface.determinationPath}`)
        .send(territorialDecisionBody(surface))
        .expect(422)
    })
  })

  describe('redress decisions', () => {
    const decisionBody = { staff_disposition: 'maintain', rationale: 'Staff kept the restriction' }

    it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`

      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.body.message).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).send({ injected: true }).expect(403)
    })

    it('rejects an unknown key before recording the decision', async () => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const { noticeId, redressId } = await seedTerritorialRedress(surface.jurisdiction, actors)
      const url = `${surface.base}/${noticeId}/redress-requests/${redressId}/decisions`

      const before = await readTerritorialReviewState(surface.jurisdiction, noticeId, [])
      await actors.staffRequest
        .post(url)
        .send({ ...decisionBody, injected: true })
        .expect(422)
      expect(await readTerritorialReviewState(surface.jurisdiction, noticeId, [])).toEqual(before)
      await assertApiNoActionRedressDecision({
        request: actors.staffRequest,
        jurisdiction: surface.jurisdiction,
        noticeId,
        redressId,
        actorId: actors.staff.id,
        claimantId: actors.claimant.id,
        disposition: 'maintain',
        rationale: decisionBody.rationale,
      })
      // Both guard endpoints run against an independently committed decision.
      const guard = await seedTerritorialRedress(surface.jurisdiction, actors)
      await seedCommittedTerritorialRedressDecision(
        surface.jurisdiction,
        guard.noticeId,
        guard.redressId,
        actors.staff,
        { disposition: 'maintain', rationale: decisionBody.rationale },
      )
      const guardUrl = `${surface.base}/${guard.noticeId}/redress-requests/${guard.redressId}/decisions`
      const committed = await readTerritorialReviewState(surface.jurisdiction, guard.noticeId, [])
      await actors.staffRequest
        .post(guardUrl)
        .send({ ...decisionBody, injected: true })
        .expect(422)
      const duplicate = await actors.staffRequest.post(guardUrl).send(decisionBody).expect(409)
      expect(duplicate.body.message).toBe(
        surface.jurisdiction === 'eu_dsa'
          ? 'EU redress decision already exists'
          : 'UK redress decision already exists',
      )
      expect(await readTerritorialReviewState(surface.jurisdiction, guard.noticeId, [])).toEqual(
        committed,
      )
    })

    it.each([
      [
        'a missing staff_disposition',
        { rationale: 'Staff rationale' },
        'staff_disposition is required',
      ],
      [
        'an unknown staff_disposition',
        { ...decisionBody, staff_disposition: 'ban' },
        'staff_disposition is required',
      ],
      ['a missing rationale', { staff_disposition: 'maintain' }, 'rationale is required'],
      ['a non-string rationale', { ...decisionBody, rationale: 7 }, 'rationale is required'],
      ['a blank rationale', { ...decisionBody, rationale: '  ' }, 'rationale is required'],
    ])('keeps the field message for %s', async (_label, body, message) => {
      const { staffRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`

      const rejected = await staffRequest.post(url).send(body).expect(422)
      expect(rejected.body.message).toBe(message)
    })

    it('checks both path ids', async () => {
      const { staffRequest } = await createTerritorialActors()

      await staffRequest
        .post(`${surface.base}/not-a-uuid/redress-requests/${crypto.randomUUID()}/decisions`)
        .send(decisionBody)
        .expect(422)
      await staffRequest
        .post(`${surface.base}/${crypto.randomUUID()}/redress-requests/not-a-uuid/decisions`)
        .send(decisionBody)
        .expect(422)
    })
  })

  // The claimant owns the notice but is not staff, so the route turns the decision away first.
  it('keeps the staff 403 ahead of the schema diagnostic for the notice claimant', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const noticeId = await seedDeterminedTerritorialNoticeForValidation(
      surface.jurisdiction,
      actors,
    )

    await actors.claimantRequest
      .post(`${surface.base}/${noticeId}/redress-requests/${crypto.randomUUID()}/decisions`)
      .send({ staff_disposition: 'maintain', rationale: 'Not staff', injected: true })
      .expect(403)
  })
})

function territorialDecisionBody(
  surface: (typeof TERRITORIAL_SURFACES)[number],
  overrides: Record<string, unknown> = {},
) {
  return {
    [surface.determinationField]: 'Staff internal rationale',
    public_explanation: 'The identified post-image is unavailable in this territory.',
    outcome: 'no_action',
    ...overrides,
  }
}
