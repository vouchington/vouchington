import { describe, expect, it } from 'vitest'
import {
  appliedThreshold,
  createThresholdManagementCase,
  readBatchSnapshotThresholds,
  readCandidateThresholdRows,
  readPromptVersionDefaults,
} from '../../test-helpers/data-stores/psql/classifier-threshold-management.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { setClassifierCandidateThreshold } from './change-classifier-candidate-threshold.mts'

describe('setClassifierCandidateThreshold', () => {
  it('deactivates the active revision and inserts a new one attributed to the actor', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.1,
      upper: null,
    })

    expect(result.outcome).toBe('changed')
    const threshold = appliedThreshold(result)
    expect(threshold).toMatchObject({
      candidate_id: fixture.topicCandidateId,
      prompt_version_id: fixture.promptVersionId,
      lower_threshold_override: 0.1,
      upper_threshold_override: null,
      effective_lower_threshold: 0.1,
      effective_upper_threshold: 0.75,
      is_active: true,
      created_by_id: actor.id,
      deactivated_by_id: null,
    })
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows).toHaveLength(2)
    expect(rows.filter(row => row.active)).toHaveLength(1)
    expect(rows.find(row => row.id === fixture.topicThresholdId)).toMatchObject({
      active: false,
      deactivatedById: actor.id,
      lower: null,
    })
    expect(threshold.id).not.toBe(fixture.topicThresholdId)
  })

  it('keeps the prompt version and its defaults untouched', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 })

    await expect(readPromptVersionDefaults(fixture.promptVersionId)).resolves.toEqual({
      lower: 0.25,
      upper: 0.75,
      activated: true,
    })
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(new Set(rows.map(row => row.promptVersionId))).toEqual(
      new Set([fixture.promptVersionId]),
    )
  })

  it('clears an override with a new revision that inherits the defaults again', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 })

    const cleared = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: null,
      upper: null,
    })

    expect(appliedThreshold(cleared)).toMatchObject({
      lower_threshold_override: null,
      upper_threshold_override: null,
      effective_lower_threshold: 0.25,
      effective_upper_threshold: 0.75,
    })
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows).toHaveLength(3)
    expect(rows.filter(row => row.active)).toHaveLength(1)
  })

  it('writes nothing when the values are already in force', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const first = await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 })
    const before = await readCandidateThresholdRows(fixture.topicCandidateId)

    const second = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.1,
      upper: 0.9,
    })

    expect(second.outcome).toBe('unchanged')
    expect(appliedThreshold(second).id).toBe(appliedThreshold(first).id)
    await expect(readCandidateThresholdRows(fixture.topicCandidateId)).resolves.toEqual(before)
  })

  it('treats clearing a candidate that has no override as unchanged', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: null,
      upper: null,
    })

    expect(result.outcome).toBe('unchanged')
    expect(appliedThreshold(result).id).toBe(fixture.topicThresholdId)
    await expect(readCandidateThresholdRows(fixture.topicCandidateId)).resolves.toHaveLength(1)
  })

  it('changes a community-owned candidate without touching the global candidate', async () => {
    const { fixture, actor } = await createThresholdManagementCase()

    const result = await setClassifierCandidateThreshold(
      actor.id,
      { classifierId: fixture.classifierId, candidateId: fixture.communityCandidateId },
      { lower: 0.35, upper: null },
    )

    expect(appliedThreshold(result)).toMatchObject({
      lower_threshold_override: 0.35,
      effective_upper_threshold: 0.75,
    })
    await expect(readCandidateThresholdRows(fixture.topicCandidateId)).resolves.toHaveLength(1)
    const community = await readCandidateThresholdRows(fixture.communityCandidateId)
    expect(community.map(row => row.active)).toEqual([false, true])
    expect(community[0]).toMatchObject({ lower: 0.3, deactivatedById: actor.id })
  })

  it('serializes concurrent changes so exactly one revision stays active', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const other = await createTestUser()

    const results = await Promise.all([
      setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: null }),
      setClassifierCandidateThreshold(other.id, scope, { lower: 0.2, upper: null }),
    ])

    expect(results.map(result => result.outcome)).toEqual(['changed', 'changed'])
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows).toHaveLength(3)
    expect(rows.filter(row => row.active)).toHaveLength(1)
  })

  it('is what the next decision batch snapshots, while an earlier batch keeps its values', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const earlier = await fixture.createTopicBatch()

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.1,
      upper: 0.9,
    })
    const later = await fixture.createTopicBatch()

    await expect(
      readBatchSnapshotThresholds(earlier.batchId, fixture.topicCandidateId),
    ).resolves.toEqual({ lower: 0.25, upper: 0.75, thresholdId: fixture.topicThresholdId })
    await expect(
      readBatchSnapshotThresholds(later.batchId, fixture.topicCandidateId),
    ).resolves.toEqual({ lower: 0.1, upper: 0.9, thresholdId: appliedThreshold(result).id })
  })
})
