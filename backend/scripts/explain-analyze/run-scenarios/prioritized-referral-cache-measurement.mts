import { extractQueryName, read, write } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import {
  getPrioritizedReferralLinks,
  loadOutOfNetworkLinks,
} from '@services/prioritized-referral-links'
import { getOfficialAccountId } from '@services/prioritized-referral-links/official-account'
import {
  clearPrioritizedLinksCache,
  prioritizedLinksCache,
} from '@services/user-referral-program-links'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'
import { registerScenarioContract } from '../plan-expectations.mts'
import { OUTPUT_DIR, runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const PROGRAM_3K_ID = seedUuid(0, '09')
const PROGRAM_10K_ID = seedUuid(1, '09')
const RANKING_QUERY = 'getOutOfNetworkReferralLinks'
const BURST_READERS = 8

type Measurement = {
  wallMs: number
  callMs: number[]
  rankingSqlLoads: number
  rankingStartsBeforeFirstResponse: number
}

/** Measure both canonically seeded cohorts after the ordinary scenario captures. */
export async function runPrioritizedReferralCacheMeasurement(): Promise<void> {
  await getOfficialAccountId() // Avoid an unrelated first-use account lookup in timed calls.
  await analyzeRankingRelations()
  const at3k = await measureSize(PROGRAM_3K_ID, 3_000)
  registerScenarioContract('prioritized-referral-links-cache-miss', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 4_000 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 30_000 },
    ],
    seededRows: { user_referral_program_links: 13_002 },
  })
  await captureRankingPlan('prioritized-referral-links-cache-miss', PROGRAM_3K_ID)
  const at10k = await measureSize(PROGRAM_10K_ID, 10_000)
  const report = {
    cacheState: 'Cold Valkey key after clear; PostgreSQL and OS cache state uncontrolled',
    overlapEvidence:
      'Client SQL submissions before the first response, not PostgreSQL execution overlap',
    burstReaders: BURST_READERS,
    planScenarios: {
      at3k: 'prioritized-referral-links-cache-miss',
      at10k: 'prioritized-referral-links-cache-miss-10k',
    },
    at3k,
    at10k,
  }
  const reportPath = join(OUTPUT_DIR, `referral-cache-miss-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Referral cache miss measurement written to: ${reportPath}`)

  registerScenarioContract('prioritized-referral-links-cache-miss-10k', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 12_000 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 90_000 },
    ],
    seededRows: { user_referral_program_links: 13_002 },
  })
  await captureRankingPlan('prioritized-referral-links-cache-miss-10k', PROGRAM_10K_ID)
}

async function captureRankingPlan(scenario: string, programId: string): Promise<void> {
  await runAndCapture(
    scenario,
    async () => {
      await clearPrioritizedLinksCache([programId])
      await getPrioritizedReferralLinks(null, programId)
    },
    undefined,
    RANKING_QUERY,
  )
}

/** Timed service calls use the real Valkey path; EXPLAIN replays run separately below. */
async function measure(programId: string, readers: number): Promise<Measurement> {
  const captured = await runWithCapturedQueries(async () => {
    const start = performance.now()
    const calls = await Promise.all(
      Array.from({ length: readers }, async () => {
        const callStart = performance.now()
        const response = await getPrioritizedReferralLinks(null, programId)
        return {
          callMs: performance.now() - callStart,
          completedAt: Date.now(),
          links: response.links.length,
        }
      }),
    )
    if (calls.some(call => call.links === 0))
      throw new Error('Seeded referral program returned no links')
    return { wallMs: performance.now() - start, calls }
  })
  const ranking = captured.queries.filter(query => extractQueryName(query.text) === RANKING_QUERY)
  const firstResponse = Math.min(...captured.result.calls.map(call => call.completedAt))
  return {
    wallMs: captured.result.wallMs,
    callMs: captured.result.calls.map(call => call.callMs),
    rankingSqlLoads: ranking.length,
    rankingStartsBeforeFirstResponse: ranking.filter(query => query.timestamp < firstResponse)
      .length,
  }
}

async function assertActiveLinks(programId: string, expected: number): Promise<void> {
  const { rows } = await read<{ active: string }>(
    `/* countMeasuredReferralLinks */ SELECT count(*)::text AS active
     FROM user_referral_program_links
     WHERE referral_program_topic_id = $1::uuid AND activated_at IS NOT NULL
       AND deleted_at IS NULL AND deactivated_at IS NULL`,
    [programId],
  )
  if (Number(rows[0]?.active) !== expected)
    throw new Error(`Expected ${expected} active referral links, found ${rows[0]?.active}`)
}

async function analyzeRankingRelations(): Promise<void> {
  await write(`/* analyzeMeasuredReferralProgram */ ANALYZE
    user_referral_program_links, urls, topics, posts, post_slugs,
    post_review_topic_ratings, post_data_point_topics, users, user_roles,
    memberships, membership_products, membership_sources, membership_source_states,
    membership_provider_observations, membership_provider_evidence_records`)
}

async function measureSize(
  programId: string,
  authors: number,
): Promise<{
  programId: string
  extensionAuthors: number
  activeLinks: number
  cold: Measurement
  immediateAfterClear: Measurement
  primedWarm: Measurement
  afterClearBurst: Measurement
}> {
  await assertActiveLinks(programId, authors + 1)
  await clearPrioritizedLinksCache([programId])
  const cold = await measure(programId, 1)
  const immediateAfterClear = await measure(programId, 1)
  // A miss's cache write is asynchronous and the clear's invalidation marker can suppress it.
  // Explicitly prime this control from the same loader; do not call it a naturally warm read.
  await prioritizedLinksCache.set(programId, await loadOutOfNetworkLinks(programId))
  const primedWarm = await measure(programId, 1)
  await clearPrioritizedLinksCache([programId])
  const afterClearBurst = await measure(programId, BURST_READERS)
  if (
    cold.rankingSqlLoads !== 1 ||
    primedWarm.rankingSqlLoads !== 0 ||
    afterClearBurst.rankingSqlLoads < 1 ||
    afterClearBurst.rankingSqlLoads > BURST_READERS
  )
    throw new Error(`Unexpected ranking SQL loads at ${authors} authors`)
  return {
    programId,
    extensionAuthors: authors,
    activeLinks: authors + 1,
    cold,
    immediateAfterClear,
    primedWarm,
    afterClearBurst,
  }
}
