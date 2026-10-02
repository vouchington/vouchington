import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  addGlobalTopicCandidates,
  appliedThreshold,
  createThresholdManagementCase,
  supersedeActivePromptVersion,
  uuidJustBefore,
} from '../../test-helpers/data-stores/psql/classifier-threshold-management.mts'
import { setClassifierCandidateThreshold } from './change-classifier-candidate-threshold.mts'
import { listStaffClassifierCandidates } from './list-staff-classifier-candidates.mts'
import { listStaffClassifiers } from './list-staff-classifiers.mts'

/** The page that starts at `id` (nothing sorts between `id` and the id just before it). */
function pageStartingAt(id: string, limit = 1) {
  return listStaffClassifiers({ limit, afterId: uuidJustBefore(id) })
}

describe('listStaffClassifiers', () => {
  it('lists a classifier with the defaults of its active prompt version', async () => {
    const { fixture } = await createThresholdManagementCase()

    const page = await pageStartingAt(fixture.classifierId)

    expect(page.results).toEqual([
      {
        id: fixture.classifierId,
        slug: expect.stringMatching(/^classifier-/),
        primitive: 'noul',
        candidate_kind: 'topic',
        activated_at: expect.any(Date),
        deactivated_at: null,
        active_prompt_version: {
          id: fixture.promptVersionId,
          model_name: 'typesafe/jev-1.13',
          model_provider: 'typesafe',
          default_lower_threshold: 0.25,
          default_upper_threshold: 0.75,
          activated_at: expect.any(Date),
        },
      },
    ])
  })

  it('has no active prompt version before the classifier is activated', async () => {
    const fixture = await createClassifierFixture()

    const page = await pageStartingAt(fixture.classifierId)

    expect(page.results[0]).toMatchObject({
      id: fixture.classifierId,
      activated_at: null,
      active_prompt_version: null,
    })
  })

  it('reports the replacement prompt version and its defaults after a rollout', async () => {
    const { fixture } = await createThresholdManagementCase()
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )

    const page = await pageStartingAt(fixture.classifierId)

    expect(page.results).toHaveLength(1)
    expect(page.results[0]!.active_prompt_version).toMatchObject({
      id: nextPromptVersionId,
      default_lower_threshold: 0.2,
      default_upper_threshold: 0.8,
    })
  })

  it('pages by id and says when more classifiers follow', async () => {
    const { fixture } = await createThresholdManagementCase()
    const [first, second] = [fixture.classifierId, fixture.storyClassifierId].toSorted()

    const firstPage = await pageStartingAt(first!)
    const secondPage = await pageStartingAt(second!)

    expect(firstPage.results.map(classifier => classifier.id)).toEqual([first])
    expect(firstPage.hasNextPage).toBe(true)
    expect(secondPage.results.map(classifier => classifier.id)).toEqual([second])
  })

  it('returns everything after the cursor in id order', async () => {
    const { fixture } = await createThresholdManagementCase()
    const [first, second] = [fixture.classifierId, fixture.storyClassifierId].toSorted()

    const page = await listStaffClassifiers({ limit: 1000, afterId: uuidJustBefore(first!) })

    const ids = page.results.map(classifier => classifier.id)
    expect(ids[0]).toBe(first)
    expect(ids).toContain(second)
    expect(ids).toEqual(ids.toSorted())
  })
})

describe('listStaffClassifierCandidates', () => {
  it('lists the global candidates with their active threshold revision', async () => {
    const { fixture } = await createThresholdManagementCase()

    const result = await listStaffClassifierCandidates({
      classifierId: fixture.classifierId,
      communityId: null,
      limit: 10,
    })

    expect(result).toEqual({
      outcome: 'ok',
      hasNextPage: false,
      results: [
        {
          id: fixture.topicCandidateId,
          candidate_kind: 'topic',
          topic_id: fixture.topicId,
          story_id: null,
          community_id: null,
          active_threshold: expect.objectContaining({
            id: fixture.topicThresholdId,
            prompt_version_id: fixture.promptVersionId,
            lower_threshold_override: null,
            upper_threshold_override: null,
            effective_lower_threshold: 0.25,
            effective_upper_threshold: 0.75,
            is_active: true,
            created_by_id: null,
          }),
        },
      ],
    })
  })

  it('lists only the candidates owned by the requested community', async () => {
    const { fixture } = await createThresholdManagementCase()

    const result = await listStaffClassifierCandidates({
      classifierId: fixture.classifierId,
      communityId: fixture.communityId,
      limit: 10,
    })

    expect(result).toMatchObject({
      outcome: 'ok',
      results: [
        {
          id: fixture.communityCandidateId,
          topic_id: fixture.communityTopicId,
          community_id: fixture.communityId,
          active_threshold: {
            id: fixture.communityThresholdId,
            lower_threshold_override: 0.3,
            upper_threshold_override: null,
            effective_lower_threshold: 0.3,
            effective_upper_threshold: 0.75,
            created_by_id: fixture.auditUserId,
          },
        },
      ],
    })
    await expect(
      listStaffClassifierCandidates({
        classifierId: fixture.classifierId,
        communityId: randomUUID(),
        limit: 10,
      }),
    ).resolves.toEqual({ outcome: 'ok', results: [], hasNextPage: false })
  })

  it('shows a change as the candidate active threshold', async () => {
    const { fixture, actor, scope } = await createThresholdManagementCase()
    const changed = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.1, upper: 0.9 }),
    )

    const result = await listStaffClassifierCandidates({
      classifierId: fixture.classifierId,
      communityId: null,
      limit: 10,
    })

    expect(result).toMatchObject({
      results: [
        {
          id: fixture.topicCandidateId,
          active_threshold: {
            id: changed.id,
            effective_lower_threshold: 0.1,
            created_by_id: actor.id,
          },
        },
      ],
    })
  })

  it('has no active threshold while the classifier has no active prompt version', async () => {
    const fixture = await createClassifierFixture()

    const result = await listStaffClassifierCandidates({
      classifierId: fixture.classifierId,
      communityId: null,
      limit: 10,
    })

    expect(result).toMatchObject({
      results: [{ id: fixture.topicCandidateId, active_threshold: null }],
    })
  })

  it('pages by candidate id', async () => {
    const fixture = await createClassifierFixture()
    const added = await addGlobalTopicCandidates(fixture, 2)
    await fixture.activateClassifierConfigurations()
    const ids = [fixture.topicCandidateId, ...added].toSorted()
    const options = { classifierId: fixture.classifierId, communityId: null, limit: 2 }

    const firstPage = await listStaffClassifierCandidates(options)
    const secondPage = await listStaffClassifierCandidates({ ...options, afterId: ids[1] })

    expect(firstPage).toMatchObject({ outcome: 'ok', hasNextPage: true })
    expect(firstPage.outcome === 'ok' && firstPage.results.map(candidate => candidate.id)).toEqual(
      ids.slice(0, 2),
    )
    expect(secondPage).toMatchObject({ outcome: 'ok', hasNextPage: false })
    expect(
      secondPage.outcome === 'ok' && secondPage.results.map(candidate => candidate.id),
    ).toEqual(ids.slice(2))
    expect(
      secondPage.outcome === 'ok' &&
        secondPage.results.every(candidate => candidate.active_threshold),
    ).toBe(true)
  })

  it('does not find an unknown classifier', async () => {
    await expect(
      listStaffClassifierCandidates({ classifierId: randomUUID(), communityId: null, limit: 10 }),
    ).resolves.toEqual({ outcome: 'not_found' })
  })
})
