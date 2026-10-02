import { describe, expect, it } from 'vitest'
import {
  appliedThreshold,
  createThresholdManagementCase,
  readCandidateThresholdRows,
  supersedeActivePromptVersion,
} from '../../test-helpers/data-stores/psql/classifier-threshold-management.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { setClassifierCandidateThreshold } from './change-classifier-candidate-threshold.mts'

describe('setClassifierCandidateThreshold refusals', () => {
  it.each([
    ['a lower bound above the default upper bound', { lower: 0.8, upper: null }],
    ['a lower bound equal to the upper bound', { lower: 0.5, upper: 0.5 }],
    ['an upper bound at or below the default lower bound', { lower: null, upper: 0.25 }],
    ['a bound below zero', { lower: -0.1, upper: null }],
    ['a bound above one', { lower: null, upper: 1.1 }],
    ['a bound with more than four decimal places', { lower: 0.12345, upper: null }],
    ['a bound that is not a number', { lower: Number.NaN, upper: null }],
  ])('rejects %s and writes nothing', async (_name, override) => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    const result = await setClassifierCandidateThreshold(actor.id, scope, override)

    expect(result.outcome).toBe('invalid')
    await expect(readCandidateThresholdRows(fixture.topicCandidateId)).resolves.toHaveLength(1)
  })

  it('accepts a lower bound above the default upper bound when the upper bound moves too', async () => {
    const { actor, scope } = await createThresholdManagementCase()

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.8,
      upper: 0.95,
    })

    expect(appliedThreshold(result)).toMatchObject({
      effective_lower_threshold: 0.8,
      effective_upper_threshold: 0.95,
    })
  })

  it('does not find a candidate that is unknown or belongs to another classifier', async () => {
    const { fixture, actor } = await createThresholdManagementCase()
    const absent = '00000000-0000-7000-8000-00000000dead'

    await expect(
      setClassifierCandidateThreshold(
        actor.id,
        { classifierId: fixture.classifierId, candidateId: absent },
        { lower: 0.1, upper: null },
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
    await expect(
      setClassifierCandidateThreshold(
        actor.id,
        { classifierId: fixture.classifierId, candidateId: fixture.storyCandidateId },
        { lower: 0.1, upper: null },
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
    await expect(
      setClassifierCandidateThreshold(
        actor.id,
        { classifierId: absent, candidateId: fixture.topicCandidateId },
        { lower: 0.1, upper: null },
      ),
    ).resolves.toEqual({ outcome: 'not_found' })
  })

  it('conflicts when the classifier has no active prompt version', async () => {
    const fixture = await createClassifierFixture()
    const actor = await createTestUser()

    const result = await setClassifierCandidateThreshold(
      actor.id,
      { classifierId: fixture.classifierId, candidateId: fixture.topicCandidateId },
      { lower: 0.1, upper: null },
    )

    expect(result).toEqual({
      outcome: 'conflict',
      reason: 'Classifier has no active prompt version',
    })
  })

  it('validates against the active prompt version defaults after a rollout', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    await supersedeActivePromptVersion(fixture.classifierId, fixture.promptVersionId, {
      lower: 0.2,
      upper: 0.6,
    })

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.7,
      upper: null,
    })

    expect(result.outcome).toBe('invalid')
  })
})
