import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { createCommunityModerationRunAdapter } from '@services/community-agent-prompts'
import { reserveClassifierRun } from '@services/classifier-runs'
import { insertClassifierRunCommunityPrompts } from '@services/classifier-runs/run-community-prompts'
import {
  createCommunityModerationFixture,
  reserveCommunityModerationFixtureRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import {
  getClassifierRunCommunityPromptIdsForTest,
  getClassifierRunConfigurationCommunityPromptIdsForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { describe, expect, it } from 'vitest'

describe('classifier run community prompts (real PG)', () => {
  it('stores each pinned prompt as a child of the reserved run, in configuration order', async () => {
    const fixture = await createCommunityModerationFixture()
    const run = await reserveCommunityModerationFixtureRun(fixture)
    const pinned = await getClassifierRunConfigurationCommunityPromptIdsForTest(run.runId)

    expect(pinned.length).toBeGreaterThan(0)
    expect(await getClassifierRunCommunityPromptIdsForTest(run.runId)).toEqual(pinned)
  })

  it('does not write the prompts again when the same run is reserved again', async () => {
    const fixture = await createCommunityModerationFixture()
    const run = await reserveCommunityModerationFixtureRun(fixture)
    const again = await reserveClassifierRun(createCommunityModerationRunAdapter(), fixture.subject)

    expect(again).toMatchObject({ kind: 'reserved', run: { runId: run.runId } })
    const pinned = await getClassifierRunConfigurationCommunityPromptIdsForTest(run.runId)
    expect(await getClassifierRunCommunityPromptIdsForTest(run.runId)).toEqual(pinned)
  })

  it('rejects a prompt id that is not a community prompt', async () => {
    const runId = await reserveSyntheticRunId()

    await expect(
      insertClassifierRunCommunityPrompts(write, runId, [randomUUID()]),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
