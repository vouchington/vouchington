import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { decodeScopedUuidCursor } from '@modules/pagination'
import { background } from '@queues/background/queues'
import { MODERATION_SIGNALS_BAN_EVASION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import { getCommunitiesWorkLimit } from '@services/communities/work-limits'
import { enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts } from '@services/posts/ban-evasion-embedding-enqueues'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postEmbeddingBanEvasionFixture } from '../seed-data/post-embedding-ban-evasion-recovery.mts'

const SCENARIO = 'post-embedding-ban-evasion-recovery-at-cap'
const CURSOR_SCOPE = 'ban-evasion:post-embedding:pending:id-asc'
const PAGE_SIZE = 100
const CAPTURED_QUERIES = [
  'enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts',
  'markSkippedPostBanEvasionEmbeddings',
  'enqueueBanEvasionDetectionForEmbeddedFirstCommunityPostChunk',
  'markEnqueuedPostBanEvasionEmbeddings',
] as const

export async function runPostEmbeddingBanEvasionRecovery(): Promise<void> {
  assert.equal(getCommunitiesWorkLimit('recovery_page_size'), PAGE_SIZE)
  const fixture = postEmbeddingBanEvasionFixture(2 * PAGE_SIZE + 1)
  try {
    await fixture.seed()
    await write('/* analyzePostEmbeddingRecoveryFixture */ ANALYZE posts')
    await captureRecoveryPages(fixture)
  } finally {
    await Promise.all((await ownedQueueJobs(fixture.communityId)).map(job => job.remove()))
    await fixture.cleanup()
  }
}

async function captureRecoveryPages(fixture: ReturnType<typeof postEmbeddingBanEvasionFixture>) {
  // https://github.com/vouchington/vouchington/issues/6595 tracks replacing hash-bucket
  // probes with ID lookups. Tuple order varies. Cap main at one bucket per enqueued ID.
  const markerVisits = (PAGE_SIZE / 2) * fixture.sharedHashRows
  const pageVisits = [2 * PAGE_SIZE, PAGE_SIZE + 1, PAGE_SIZE, markerVisits]
  registerScenarioContract(SCENARIO, {
    allowEmptyResult: true,
    crossPartition: {
      posts: 'Pending recovery and first-post eligibility span retained post history.',
    },
    expectations: [...pageVisits, ...pageVisits].map((max, captureIndex) => ({
      kind: 'maxProcessedRows',
      relation: 'posts',
      max,
      captureIndex,
    })),
  })
  let terminalCursor: string | undefined
  await runAndCapture(
    SCENARIO,
    async () => {
      const first = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts()
      assertPage(first, fixture.pendingIds[PAGE_SIZE - 1]!)
      const last = await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
        after: first.nextCursor!,
      })
      assertPage(last, fixture.pendingIds[2 * PAGE_SIZE - 1]!)
      terminalCursor = last.nextCursor!
    },
    undefined,
    CAPTURED_QUERIES,
    {
      exactCapturedNames: [...CAPTURED_QUERIES, ...CAPTURED_QUERIES],
      afterCapture: async () => {
        await assertRecoveryWrites(fixture, 2 * PAGE_SIZE)
        assert.ok(terminalCursor)
        assert.deepEqual(
          await enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts({
            after: terminalCursor,
          }),
          { enqueuedCount: 1, scannedCount: 1, nextCursor: null },
        )
        await assertRecoveryWrites(fixture, fixture.pendingIds.length)
        await write(
          '/* restorePostEmbeddingRecoveryFixture */ UPDATE posts SET ban_evasion_post_embedding_input_sha256=NULL WHERE id=ANY($1::uuid[])',
          [fixture.pendingIds],
        )
      },
    },
  )
}

function assertPage(
  page: Awaited<ReturnType<typeof enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts>>,
  lastId: string,
) {
  assert.equal(page.scannedCount, PAGE_SIZE)
  assert.equal(page.enqueuedCount, PAGE_SIZE / 2)
  assert.ok(page.nextCursor)
  assert.equal(
    decodeScopedUuidCursor(page.nextCursor, CURSOR_SCOPE, 'Invalid recovery cursor').id,
    lastId,
  )
}

async function ownedQueueJobs(communityId: string) {
  return background.searchJobs({
    name: MODERATION_SIGNALS_BAN_EVASION_JOB.name,
    data: { communityId },
    limit: 2 * PAGE_SIZE + 1,
  })
}

async function assertRecoveryWrites(
  fixture: ReturnType<typeof postEmbeddingBanEvasionFixture>,
  markedCount: number,
) {
  const jobs = await ownedQueueJobs(fixture.communityId)
  const expectedJobs = fixture.firstPosts.slice(0, Math.ceil(markedCount / 2))
  assert.deepEqual(
    jobs
      .map(job => job.data as (typeof expectedJobs)[number])
      .toSorted((a, b) => a.postId.localeCompare(b.postId)),
    expectedJobs,
  )
  const { rows } = await write<{ id: string; marker: string | null }>(
    `/* assertPostEmbeddingRecoveryMarkers */
    SELECT id,encode(ban_evasion_post_embedding_input_sha256,'hex') AS marker
    FROM posts WHERE id=ANY($1::uuid[]) ORDER BY id`,
    [fixture.allPostIds],
  )
  const marked = new Set([...fixture.pendingIds.slice(0, markedCount), ...fixture.markedNoiseIds])
  assert.deepEqual(
    rows,
    fixture.allPostIds.toSorted().map(id => ({
      id,
      marker: marked.has(id) ? fixture.hashHex : null,
    })),
  )
}
