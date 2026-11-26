import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { listTopicClaimsForTopic, listTopicClaimsForUser } from '@services/topic-claims/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  createClaimFixtureUsers,
  createTopicClaimFixtureTopic,
  deleteTopicClaimFixtures,
  deleteTopicClaimFixtureTopic,
  HISTORY_PER_LIVE_CLAIM,
  insertTopicClaimFixtures,
} from '../seed-data/topic-claim-capacity.mts'

const PAGE_SIZE = 100
const TARGET_CLAIM_COUNT = PAGE_SIZE + 1
export async function runTopicClaimCapacityScenarios(): Promise<void> {
  const topicId = await createTopicClaimFixtureTopic()
  let claimantIds: string[] = []
  let backgroundClaimantIds: string[] = []
  const topicIds = Array.from({ length: TARGET_CLAIM_COUNT }, (_, index) => seedUuid(index, '04'))
  const backgroundTopics = Array.from({ length: 20 }, () => topicIds).flat()
  try {
    claimantIds = await createClaimFixtureUsers(TARGET_CLAIM_COUNT)
    backgroundClaimantIds = await createClaimFixtureUsers(20)
    const background = await insertTopicClaimFixtures(
      backgroundTopics,
      backgroundClaimantIds.flatMap(id => topicIds.map(() => id)),
    )
    const fixture = await insertTopicClaimFixtures(
      claimantIds.map(() => topicId),
      claimantIds,
    )
    assert.equal(fixture.liveIds.length, TARGET_CLAIM_COUNT)
    assert.equal(fixture.allIds.length, TARGET_CLAIM_COUNT * (HISTORY_PER_LIVE_CLAIM + 1))
    await write('/* analyzeTopicClaimCapacity */ ANALYZE topic_claims')
    registerScenarioContract('topic-claims-for-topic-at-live-cap', {
      expectations: [
        // #6412 tracks the generic first page scanning rejected history.
        { kind: 'maxProcessedRows', relation: 'topic_claims', max: 505 },
      ],
      seededRows: { topic_claims: fixture.allIds.length + background.allIds.length },
    })
    const scope = `topic-claims:topic:${topicId}:staff:true:id-desc`
    await runAndCapture(
      'topic-claims-for-topic-at-live-cap',
      async () => {
        const first = await listTopicClaimsForTopic(topicId, {
          activeOnly: true,
          limit: PAGE_SIZE,
        })
        const ids = fixture.liveIds.toSorted().toReversed()
        assertClaimPage(first, ids.slice(0, PAGE_SIZE), scope, true)
        const last = await listTopicClaimsForTopic(topicId, {
          activeOnly: true,
          limit: PAGE_SIZE,
          after: first.page_info.end_cursor!,
        })
        assertClaimPage(last, ids.slice(PAGE_SIZE), scope, false)
      },
      undefined,
      'listTopicClaimsForTopic',
      { exactCapturedNames: ['listTopicClaimsForTopic', 'listTopicClaimsForTopic'] },
    )
  } finally {
    try {
      const userIds = [...claimantIds, ...backgroundClaimantIds]
      if (userIds.length > 0) await deleteTopicClaimFixtures(userIds)
    } finally {
      await deleteTopicClaimFixtureTopic(topicId)
    }
  }

  const [claimantId, ...userBackgroundClaimantIds] = await createClaimFixtureUsers(21)
  assert.ok(claimantId)
  try {
    const background = await insertTopicClaimFixtures(
      backgroundTopics,
      userBackgroundClaimantIds.flatMap(id => topicIds.map(() => id)),
    )
    const userFixture = await insertTopicClaimFixtures(
      topicIds,
      topicIds.map(() => claimantId),
    )
    assert.equal(userFixture.liveIds.length, TARGET_CLAIM_COUNT)
    assert.equal(userFixture.allIds.length, TARGET_CLAIM_COUNT * (HISTORY_PER_LIVE_CLAIM + 1))
    await write('/* analyzeTopicClaimCapacity */ ANALYZE topic_claims')
    registerScenarioContract('topic-claims-for-user-at-live-cap', {
      expectations: [
        // #6415 tracks the generic continuation scanning other users' claims.
        { kind: 'maxProcessedRows', relation: 'topic_claims', max: 10_101 },
      ],
      seededRows: { topic_claims: userFixture.allIds.length + background.allIds.length },
    })
    const scope = `topic-claims:user:${claimantId}:all:true:id-desc`
    await runAndCapture(
      'topic-claims-for-user-at-live-cap',
      async () => {
        const first = await listTopicClaimsForUser(claimantId, {
          verifiedOnly: true,
          limit: PAGE_SIZE,
        })
        const ids = userFixture.liveIds.toSorted().toReversed()
        assertClaimPage(first, ids.slice(0, PAGE_SIZE), scope, true)
        const last = await listTopicClaimsForUser(claimantId, {
          verifiedOnly: true,
          limit: PAGE_SIZE,
          after: first.page_info.end_cursor!,
        })
        assertClaimPage(last, ids.slice(PAGE_SIZE), scope, false)
      },
      undefined,
      'listTopicClaimsForUser',
      { exactCapturedNames: ['listTopicClaimsForUser', 'listTopicClaimsForUser'] },
    )
  } finally {
    await deleteTopicClaimFixtures([claimantId, ...userBackgroundClaimantIds])
  }
}

function assertClaimPage(
  page: Awaited<ReturnType<typeof listTopicClaimsForUser>>,
  ids: readonly string[],
  scope: string,
  hasNextPage: boolean,
): void {
  assert.deepEqual(
    page.results.map(claim => claim.id),
    ids,
  )
  assert.equal(page.page_info.has_next_page, hasNextPage)
  assert.equal(
    page.page_info.end_cursor,
    hasNextPage ? encodeScopedUuidCursor(ids.at(-1)!, scope) : null,
  )
}
