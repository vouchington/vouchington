import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getDateFromUUIDv7, mintUUIDv7 } from '@modules/utils'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestPost } from '@voucha/test-helpers/entities/create-test-entities'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { insertTestReferralProgram } from '@voucha/test-helpers/entities/cards'
import { setTestRobotsTxtCache } from '@voucha/test-helpers/entities/dispatch'
import { insertTestPostRelatedUrlBatch } from '@voucha/test-helpers/entities/hostname-blocking'
import {
  insertTestCrawlDispatchPlanUrls,
  analyzeTestCrawlDispatchPlanTables,
} from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import {
  insertTestReferralCrawlPlanLinks,
  insertTestUnfurlDispatchPlanLinks,
  analyzeTestUnfurlDispatchPlanTable,
} from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getEntityRelationUrlTables } from '@services/entity-relations/url-tables'

/** Realistic selectivity belongs to the standalone EXPLAIN runner, never unit fixtures. */
export async function prepareCrawlDispatchScale() {
  const actor = await createTestUser()
  const suffix = randomUUID()
  const hostname = `crawl-plan-${suffix}.example.com`
  const target = (await insertTestUrlDirect(actor.id, `https://${hostname}/base`))!
  await updateUrlHostname(target.hostname.id, { is_crawlable: true })
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  const unrelated = (await insertTestUrlDirect(
    actor.id,
    `https://unrelated-${suffix}.example.com/base`,
  ))!
  await insertTestCrawlDispatchPlanUrls({
    ids: Array.from({ length: 10000 }, () => mintUUIDv7()),
    hostname: unrelated.hostname.hostname,
    hostnameId: unrelated.hostname.id,
    actorId: actor.id,
  })
  const post = await createTestPost({ user: actor })
  const eligibleIds = Array.from({ length: 10 }, () => mintUUIDv7())
  await insertTestPostRelatedUrlBatch({
    postIds: eligibleIds.map(() => post.id),
    urlIds: eligibleIds,
    hostname,
    hostnameId: target.hostname.id,
    createdById: actor.id,
  })
  const tier2Ids = Array.from({ length: 10 }, () => mintUUIDv7())
  await insertTestPostRelatedUrlBatch({
    postIds: tier2Ids.map(() => post.id),
    urlIds: tier2Ids,
    hostname,
    hostnameId: target.hostname.id,
    createdById: actor.id,
    votesScoreUp: 0,
  })
  await analyzeTestCrawlDispatchPlanTables()
  const seededRows = await countCrawlDispatchCandidateRows()
  const sweepStartedAt = ownedSweepAfter([target.id, ...eligibleIds, ...tier2Ids], 1)
  return { hostnameId: target.hostname.id, afterId: target.id, sweepStartedAt, seededRows }
}

async function countCrawlDispatchCandidateRows(): Promise<Record<string, number>> {
  const tables = [
    'urls',
    'url_hostnames',
    'crawls',
    'user_profile_links',
    ...getEntityRelationUrlTables(),
  ]
  const seededRows: Record<string, number> = {}
  for (const table of tables) {
    const result = await write<{ count: string }>(
      `/* countCrawlDispatchCandidateRows */ SELECT COUNT(*)::text AS count FROM "${table}"`,
    )
    const count = Number(result.rows[0]?.count)
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error(`Missing candidate row count for ${table}`)
    seededRows[table] = count
  }
  return seededRows
}

export async function prepareReferralCrawlScale() {
  const owner = await createTestUser()
  const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
  const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
  const urlIds = Array.from({ length: 10004 }, () => mintUUIDv7())
  await insertTestCrawlDispatchPlanUrls({
    ids: urlIds,
    hostname: base.hostname.hostname,
    hostnameId: base.hostname.id,
    actorId: owner.id,
  })
  const requestedAt = ownedSweepAfter([base.id, ...urlIds], 1)
  await insertTestReferralCrawlPlanLinks({
    userId: owner.id,
    referralProgramId,
    urlIds: urlIds.slice(0, 10000),
    lastSuccessAt: requestedAt,
  })
  const skipped = await insertTestReferralCrawlPlanLinks({
    userId: owner.id,
    referralProgramId,
    urlIds: urlIds.slice(10000, 10002),
    lastSuccessAt: null,
    lastFailureAt: requestedAt,
  })
  const healthy = await insertTestReferralCrawlPlanLinks({
    userId: owner.id,
    referralProgramId,
    urlIds: urlIds.slice(10002),
    lastSuccessAt: new Date(new Date(requestedAt).getTime() - 8 * 86400000).toISOString(),
  })
  assertOwnedIdsWithinSweep([...skipped, ...healthy], requestedAt)
  await analyzeTestUnfurlDispatchPlanTable()
  return { sweepStartedAt: requestedAt, skipped, healthy }
}

export async function prepareReferralUnfurlScale() {
  const owner = await createTestUser()
  const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
  const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
  const urlIds = Array.from({ length: 10010 }, () => mintUUIDv7())
  await insertTestCrawlDispatchPlanUrls({
    ids: urlIds,
    hostname: base.hostname.hostname,
    hostnameId: base.hostname.id,
    actorId: owner.id,
  })
  const dueAt = ownedSweepAfter([base.id, ...urlIds], 2)
  await insertTestUnfurlDispatchPlanLinks({
    userId: owner.id,
    referralProgramId,
    urlIds: urlIds.slice(0, 10000),
    requestedAt: new Date(new Date(dueAt).getTime() + 1).toISOString(),
  })
  const ids = await insertTestUnfurlDispatchPlanLinks({
    userId: owner.id,
    referralProgramId,
    urlIds: urlIds.slice(10000),
    requestedAt: dueAt,
  })
  assertOwnedIdsWithinSweep(ids, dueAt)
  await analyzeTestUnfurlDispatchPlanTable()
  return { dueAt, ids }
}

/** Explicit business cursor; never changes native UUID or audit clocks. */
function ownedSweepAfter(ids: readonly string[], elapsedDays: number): string {
  const timestamps = ids.map(id => {
    const date = getDateFromUUIDv7(id)
    if (!date || !Number.isFinite(date.getTime())) throw new Error('Missing owned UUID timestamp')
    return date.getTime()
  })
  return new Date(Math.max(...timestamps) + elapsedDays * 86400000).toISOString()
}

/** PostgreSQL allocates link IDs independently of the Node fixture clock. */
function assertOwnedIdsWithinSweep(ids: readonly string[], sweep: string): void {
  const upperTimestamp = new Date(sweep).getTime()
  for (const id of ids) {
    const date = getDateFromUUIDv7(id)
    if (!date || !Number.isFinite(date.getTime()) || date.getTime() > upperTimestamp)
      throw new Error('Owned link UUID exceeds the business cursor cutoff')
  }
}
