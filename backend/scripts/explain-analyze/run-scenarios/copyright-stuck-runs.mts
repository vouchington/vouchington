import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import {
  expireStuckCopyrightAppealRecommendationRunPage,
  expireStuckCopyrightEmailRecommendationRunPage,
  expireStuckCopyrightSubmissionGuidanceRunPage,
} from '@services/copyright-notices/expire-stuck-runs'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightStuckRuns } from '../seed-data/copyright-stuck-runs.mts'

// The three copyright page sizes share the 500-row hard cap in stuck-run-expiry.mts.
const PAGE_SIZE = 500

const scenarios = [
  {
    kind: 'email',
    id: 'copyright-stuck-email-runs-at-cap',
    relation: 'copyright_notice_email_intake_recommendation_runs',
    queryName: 'expireStuckCopyrightEmailRecommendationRuns',
    expire: expireStuckCopyrightEmailRecommendationRunPage,
  },
  {
    kind: 'appeal',
    id: 'copyright-stuck-appeal-runs-at-cap',
    relation: 'copyright_notice_appeal_recommendation_runs',
    queryName: 'expireStuckCopyrightAppealRecommendationRuns',
    expire: expireStuckCopyrightAppealRecommendationRunPage,
  },
  {
    kind: 'guidance',
    id: 'copyright-stuck-guidance-runs-at-cap',
    relation: 'copyright_notice_submission_guidance_runs',
    queryName: 'expireStuckCopyrightSubmissionGuidanceRuns',
    expire: expireStuckCopyrightSubmissionGuidanceRunPage,
  },
] as const

type RunRelation = (typeof scenarios)[number]['relation']

async function readRunStatuses(relation: RunRelation, ids: readonly string[]) {
  return (
    await write<{ id: string; status: string }>(
      `/* readCopyrightStuckRunFixtureStatuses */
       SELECT id, status FROM ${relation} WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    )
  ).rows
}

export async function runCopyrightStuckRunCapacityScenarios(): Promise<void> {
  for (const scenario of scenarios) {
    await runCopyrightStuckRunCapacityScenario(scenario)
  }
}

async function runCopyrightStuckRunCapacityScenario(scenario: (typeof scenarios)[number]) {
  const fixture = await seedCopyrightStuckRuns(scenario.kind, PAGE_SIZE)
  const relation = scenario.relation
  try {
    await write(`/* analyzeCopyrightStuckRunFixture */ ANALYZE ${relation}`)
    const survivors = [fixture.nextId, ...fixture.survivorIds]
    const before = await readRunStatuses(relation, survivors)
    assert.equal(before.length, survivors.length)
    assert.equal(before.find(row => row.id === fixture.nextId)?.status, 'active')
    assert(before.some(row => row.id > fixture.cutoffId && row.status === 'active'))
    assert(before.some(row => row.id < fixture.cutoffId && row.status === 'expired'))
    registerScenarioContract(scenario.id, {
      seededRows: { [relation]: fixture.seededRows },
      expectations: [{ kind: 'queryBinds', token: 'LIMIT' }],
    })
    await runAndCapture(
      scenario.id,
      async () => {
        assert.equal(await scenario.expire(fixture.cutoffId, PAGE_SIZE), PAGE_SIZE)
        assert.deepEqual(
          await readRunStatuses(relation, fixture.firstIds),
          fixture.firstIds.toSorted().map(id => ({ id, status: 'failed' })),
        )
        assert.deepEqual(await readRunStatuses(relation, survivors), before)
      },
      undefined,
      scenario.queryName,
      {
        afterCapture: async () => {
          await write(
            `/* restoreCopyrightStuckRunCapacityPage */
             UPDATE ${relation} SET failed_at = NULL WHERE id = ANY($1::uuid[])`,
            [fixture.firstIds],
          )
        },
      },
    )
  } finally {
    await fixture.cleanup()
  }
}
