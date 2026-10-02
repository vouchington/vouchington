import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  appliedThreshold,
  createThresholdManagementCase,
  readCandidateThresholdRows,
  supersedeActivePromptVersion,
} from '@voucha/test-helpers/data-stores/psql/classifier-threshold-management'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import { setClassifierCandidateThreshold } from '@services/classifiers/change-classifier-candidate-threshold'
import type { PrivateUser } from '@services/users/types'

type ThresholdCase = Awaited<ReturnType<typeof createThresholdManagementCase>>

const ABSENT_ID = '00000000-0000-7000-8000-00000000dead'
const OVERRIDE = { lower_threshold_override: 0.1, upper_threshold_override: 0.9 }

function thresholdPath(scope: { classifierId: string; candidateId: string }) {
  return `/api/v1/admin/classifiers/${scope.classifierId}/candidates/${scope.candidateId}/threshold`
}

describe('classifier threshold change routes', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  async function send(
    kase: ThresholdCase,
    method: 'put' | 'post',
    user: PrivateUser | null,
    body: unknown,
  ) {
    const request = createRequest()
    if (user) await request.authenticateAs(user)
    const path = thresholdPath(kase.scope)
    return method === 'put'
      ? request.put(path).send(body as object)
      : request.post(`${path}/rollback`).send(body as object)
  }

  describe('PUT /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold', () => {
    it('sets an override as a new revision attributed to the administrator', async () => {
      const kase = await createThresholdManagementCase()

      const response = await send(kase, 'put', admin, OVERRIDE)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        changed: true,
        threshold: {
          candidate_id: kase.fixture.topicCandidateId,
          prompt_version_id: kase.fixture.promptVersionId,
          lower_threshold_override: 0.1,
          upper_threshold_override: 0.9,
          effective_lower_threshold: 0.1,
          effective_upper_threshold: 0.9,
          is_active: true,
          created_by_id: admin.id,
        },
      })
      const rows = await readCandidateThresholdRows(kase.fixture.topicCandidateId)
      expect(rows).toHaveLength(2)
      expect(rows.find(row => row.id === kase.fixture.topicThresholdId)).toMatchObject({
        active: false,
        deactivatedById: admin.id,
      })
    })

    it('writes nothing when the values are already in force', async () => {
      const kase = await createThresholdManagementCase()
      await send(kase, 'put', admin, OVERRIDE)

      const response = await send(kase, 'put', admin, OVERRIDE)

      expect(response.status).toBe(200)
      expect(response.body.changed).toBe(false)
      await expect(readCandidateThresholdRows(kase.fixture.topicCandidateId)).resolves.toHaveLength(
        2,
      )
    })

    it('clears the override when both bounds are null', async () => {
      const kase = await createThresholdManagementCase()
      await send(kase, 'put', admin, OVERRIDE)

      const response = await send(kase, 'put', admin, {
        lower_threshold_override: null,
        upper_threshold_override: null,
      })

      expect(response.status).toBe(200)
      expect(response.body.threshold).toMatchObject({
        lower_threshold_override: null,
        upper_threshold_override: null,
        effective_lower_threshold: 0.25,
        effective_upper_threshold: 0.75,
      })
    })

    it.each([
      [
        'a lower bound above the default upper bound',
        { ...OVERRIDE, upper_threshold_override: null, lower_threshold_override: 0.9 },
      ],
      ['equal bounds', { lower_threshold_override: 0.5, upper_threshold_override: 0.5 }],
      ['a bound above one', { lower_threshold_override: null, upper_threshold_override: 1.5 }],
      [
        'a bound with five decimal places',
        { lower_threshold_override: 0.12345, upper_threshold_override: null },
      ],
      [
        'a bound that is not a number',
        { lower_threshold_override: 'low', upper_threshold_override: null },
      ],
      ['a missing bound', { lower_threshold_override: 0.1 }],
      ['no body fields', {}],
    ])('answers 422 for %s and writes nothing', async (_name, body) => {
      const kase = await createThresholdManagementCase()

      const response = await send(kase, 'put', admin, body)

      expect(response.status).toBe(422)
      await expect(readCandidateThresholdRows(kase.fixture.topicCandidateId)).resolves.toHaveLength(
        1,
      )
    })

    it('answers 404 for a candidate of another classifier and for an unknown one', async () => {
      const kase = await createThresholdManagementCase()
      const request = createRequest()
      await request.authenticateAs(admin)
      const { classifierId } = kase.scope

      await request
        .put(thresholdPath({ classifierId, candidateId: kase.fixture.storyCandidateId }))
        .send(OVERRIDE)
        .expect(404)
      await request
        .put(thresholdPath({ classifierId, candidateId: ABSENT_ID }))
        .send(OVERRIDE)
        .expect(404)
    })

    it('answers 409 while the classifier has no active prompt version', async () => {
      const fixture = await createClassifierFixture()
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request
        .put(
          thresholdPath({
            classifierId: fixture.classifierId,
            candidateId: fixture.topicCandidateId,
          }),
        )
        .send(OVERRIDE)

      expect(response.status).toBe(409)
    })

    it('answers 422 for ids that are not UUIDs', async () => {
      const kase = await createThresholdManagementCase()
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .put(thresholdPath({ classifierId: 'nope', candidateId: kase.scope.candidateId }))
        .send(OVERRIDE)
        .expect(422)
      await request
        .put(thresholdPath({ classifierId: kase.scope.classifierId, candidateId: 'nope' }))
        .send(OVERRIDE)
        .expect(422)
    })
  })

  describe('POST /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback', () => {
    it('re-applies an earlier revision as a new revision attributed to the administrator', async () => {
      const kase = await createThresholdManagementCase()
      const first = appliedThreshold(
        await setClassifierCandidateThreshold(regularUser.id, kase.scope, {
          lower: 0.1,
          upper: 0.9,
        }),
      )
      await setClassifierCandidateThreshold(regularUser.id, kase.scope, { lower: 0.2, upper: null })

      const response = await send(kase, 'post', admin, { revision_id: first.id })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        changed: true,
        threshold: {
          lower_threshold_override: 0.1,
          upper_threshold_override: 0.9,
          is_active: true,
          created_by_id: admin.id,
        },
      })
      expect(response.body.threshold.id).not.toBe(first.id)
      const rows = await readCandidateThresholdRows(kase.fixture.topicCandidateId)
      expect(rows).toHaveLength(4)
      expect(rows.filter(row => row.active)).toHaveLength(1)
    })

    it('reports the revision already in force as unchanged', async () => {
      const kase = await createThresholdManagementCase()

      const response = await send(kase, 'post', admin, {
        revision_id: kase.fixture.topicThresholdId,
      })

      expect(response.status).toBe(200)
      expect(response.body.changed).toBe(false)
    })

    it('answers 404 for the revision of another candidate and for an unknown one', async () => {
      const kase = await createThresholdManagementCase()

      const other = await send(kase, 'post', admin, {
        revision_id: kase.fixture.communityThresholdId,
      })
      const unknown = await send(kase, 'post', admin, { revision_id: ABSENT_ID })

      expect(other.status).toBe(404)
      expect(unknown.status).toBe(404)
    })

    it('answers 409 for a revision of an earlier prompt version', async () => {
      const kase = await createThresholdManagementCase()
      await supersedeActivePromptVersion(kase.fixture.classifierId, kase.fixture.promptVersionId)

      const response = await send(kase, 'post', admin, {
        revision_id: kase.fixture.topicThresholdId,
      })

      expect(response.status).toBe(409)
      await expect(readCandidateThresholdRows(kase.fixture.topicCandidateId)).resolves.toHaveLength(
        1,
      )
    })

    it.each([
      ['a revision id that is not a UUID', { revision_id: 'not-a-uuid' }],
      ['no revision id', {}],
      ['a revision id that is not a string', { revision_id: 7 }],
    ])('answers 422 for %s', async (_name, body) => {
      const kase = await createThresholdManagementCase()

      const response = await send(kase, 'post', admin, body)

      expect(response.status).toBe(422)
      await expect(readCandidateThresholdRows(kase.fixture.topicCandidateId)).resolves.toHaveLength(
        1,
      )
    })
  })
})
