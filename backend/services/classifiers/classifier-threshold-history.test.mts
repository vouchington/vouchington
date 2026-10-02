import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  appliedThreshold,
  createThresholdManagementCase,
  supersedeActivePromptVersion,
  uuidJustBefore,
} from '../../test-helpers/data-stores/psql/classifier-threshold-management.mts'
import { setClassifierCandidateThreshold } from './change-classifier-candidate-threshold.mts'
import { listClassifierThresholdRevisions } from './list-classifier-threshold-revisions.mts'

describe('listClassifierThresholdRevisions', () => {
  it('lists the history newest first, across prompt versions', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const first = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 }),
    )
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )
    const latest = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.15, upper: null }),
    )

    const result = await listClassifierThresholdRevisions({ ...scope, limit: 10 })

    expect(result.outcome).toBe('ok')
    const revisions = result.outcome === 'ok' ? result.results : []
    expect(revisions.map(revision => revision.id)).toEqual([
      latest.id,
      first.id,
      fixture.topicThresholdId,
    ])
    expect(revisions.map(revision => revision.prompt_version_id)).toEqual([
      nextPromptVersionId,
      fixture.promptVersionId,
      fixture.promptVersionId,
    ])
    expect(revisions.map(revision => revision.is_active)).toEqual([true, true, false])
    expect(revisions[0]).toMatchObject({
      lower_threshold_override: 0.15,
      effective_upper_threshold: 0.8,
      created_by_id: actor.id,
      deactivated_at: null,
    })
    expect(revisions[2]).toMatchObject({ deactivated_by_id: actor.id })
  })

  it('pages newest first with a cursor and says when older revisions remain', async () => {
    const { actor, scope } = await createThresholdManagementCase()
    const first = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 }),
    )
    const second = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.2, upper: 0.9 }),
    )

    const firstPage = await listClassifierThresholdRevisions({ ...scope, limit: 1 })
    const secondPage = await listClassifierThresholdRevisions({
      ...scope,
      limit: 1,
      beforeId: second.id,
    })
    const lastPage = await listClassifierThresholdRevisions({
      ...scope,
      limit: 5,
      beforeId: first.id,
    })

    expect(firstPage).toMatchObject({ hasNextPage: true, results: [{ id: second.id }] })
    expect(secondPage).toMatchObject({ hasNextPage: true, results: [{ id: first.id }] })
    expect(lastPage).toMatchObject({ hasNextPage: false })
    expect(lastPage.outcome === 'ok' && lastPage.results).toHaveLength(1)
  })

  it('is an empty page, not a not-found, once the cursor passes the oldest revision', async () => {
    const { fixture, scope } = await createThresholdManagementCase()

    const result = await listClassifierThresholdRevisions({
      ...scope,
      limit: 10,
      beforeId: uuidJustBefore(fixture.topicThresholdId),
    })

    expect(result).toEqual({ outcome: 'ok', results: [], hasNextPage: false })
  })

  it('does not find a candidate of another classifier or one that does not exist', async () => {
    const { fixture } = await createThresholdManagementCase()

    await expect(
      listClassifierThresholdRevisions({
        classifierId: fixture.storyClassifierId,
        candidateId: fixture.topicCandidateId,
        limit: 10,
      }),
    ).resolves.toEqual({ outcome: 'not_found' })
    await expect(
      listClassifierThresholdRevisions({
        classifierId: fixture.classifierId,
        candidateId: randomUUID(),
        limit: 10,
      }),
    ).resolves.toEqual({ outcome: 'not_found' })
  })
})
