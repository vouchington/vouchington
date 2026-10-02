import { describe, expect, it } from 'vitest'
import {
  appliedThreshold,
  createThresholdManagementCase,
  readCandidateThresholdRows,
  supersedeActivePromptVersion,
} from '../../test-helpers/data-stores/psql/classifier-threshold-management.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import {
  rollbackClassifierCandidateThreshold,
  setClassifierCandidateThreshold,
} from './change-classifier-candidate-threshold.mts'

describe('rollbackClassifierCandidateThreshold', () => {
  it('re-applies an earlier revision as a new revision and keeps the old one as history', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const reviewer = await createTestUser()
    const first = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 }),
    )
    await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.2, upper: null })

    const result = await rollbackClassifierCandidateThreshold(reviewer.id, scope, first.id)

    expect(result.outcome).toBe('changed')
    const restored = appliedThreshold(result)
    expect(restored).toMatchObject({
      lower_threshold_override: 0.1,
      upper_threshold_override: 0.9,
      is_active: true,
      created_by_id: reviewer.id,
    })
    expect(restored.id).not.toBe(first.id)
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows).toHaveLength(4)
    expect(rows.filter(row => row.active)).toHaveLength(1)
    expect(rows.find(row => row.id === first.id)).toMatchObject({
      active: false,
      createdById: actor.id,
      deactivatedById: actor.id,
    })
    expect(rows.find(row => row.active)!.id).toBe(restored.id)
  })

  it('can restore the original defaults by rolling back to the seed revision', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 })

    const result = await rollbackClassifierCandidateThreshold(
      actor.id,
      scope,
      fixture.topicThresholdId,
    )

    expect(appliedThreshold(result)).toMatchObject({
      lower_threshold_override: null,
      upper_threshold_override: null,
      effective_lower_threshold: 0.25,
    })
  })

  it('is unchanged when the revision is the one already active', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    const result = await rollbackClassifierCandidateThreshold(
      actor.id,
      scope,
      fixture.topicThresholdId,
    )

    expect(result.outcome).toBe('unchanged')
    await expect(readCandidateThresholdRows(fixture.topicCandidateId)).resolves.toHaveLength(1)
  })

  it('does not find a revision of another candidate or one that does not exist', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()

    await expect(
      rollbackClassifierCandidateThreshold(actor.id, scope, fixture.communityThresholdId),
    ).resolves.toEqual({ outcome: 'not_found' })
    await expect(
      rollbackClassifierCandidateThreshold(actor.id, scope, '00000000-0000-7000-8000-00000000dead'),
    ).resolves.toEqual({ outcome: 'not_found' })
  })

  it('conflicts for a revision of an earlier prompt version and writes nothing', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )

    const result = await rollbackClassifierCandidateThreshold(
      actor.id,
      scope,
      fixture.topicThresholdId,
    )

    expect(result.outcome).toBe('conflict')
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.promptVersionId).not.toBe(nextPromptVersionId)
  })

  it('starts the new prompt version history and leaves the old version revisions as they were', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )

    const result = await setClassifierCandidateThreshold(actor.id, scope, {
      lower: 0.1,
      upper: null,
    })

    expect(appliedThreshold(result)).toMatchObject({
      prompt_version_id: nextPromptVersionId,
      effective_upper_threshold: 0.8,
    })
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    expect(rows.find(row => row.id === fixture.topicThresholdId)!.active).toBe(true)
    expect(rows.filter(row => row.promptVersionId === nextPromptVersionId)).toHaveLength(1)
  })
})
