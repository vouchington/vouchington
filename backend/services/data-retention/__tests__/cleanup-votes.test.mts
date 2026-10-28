import { randomInt, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import {
  createTestUserDirect,
  beginTransaction,
  getTestVoteBallotCleanupCursor,
  getTestPostVoteIds,
  getTestRetainedPostVoteCount,
  getTestVoteIntegrityFlagDetails,
  hasTestUserAgentString,
  insertTestPost,
  insertTestPostVote,
  insertTestPostVoteWithUserAgent,
  insertTestUserSession,
  insertTestVoteIntegrityFlag,
  resetTestVoteBallotCleanupCursor,
} from '@voucha/test-helpers'
import {
  cleanupSupersededVoteBallots,
  cleanupSupersededVoteBallotTable,
} from '../cleanup-vote-ballots.mts'
import { cleanupOrphanedUserAgentStrings } from '../cleanup-user-agent-strings.mts'
import { cleanupVoteIntegrityDetails } from '../cleanup-vote-integrity-details.mts'
import { runVoteRetentionCleanupPage } from '../cleanup.mts'
import { getEngagement } from '@services/growth-metrics/get-engagement'
import { deleteTestUserSession } from '../../../test-helpers/entities/user-sessions.mts'

const NOW = new Date('2026-10-23T12:00:00.000Z')

async function postForTest() {
  const user = await createTestUserDirect()
  if (!user) throw new Error('Failed to create test user')
  const postId = await insertTestPost({
    createdById: user.id,
    title: 'Ballot retention test',
    slug: `ballot-retention-${randomUUID()}`,
    markdown: 'test',
  })
  return { userId: user.id, postId }
}

describe('vote and user-agent retention', () => {
  it('visits only the unfinished ballot tables in a continuation', async () => {
    const pages = await cleanupSupersededVoteBallots(1, NOW, { post_votes: [] }, ['post_votes'])
    expect(pages).toEqual([{ voteTable: 'post_votes', scanned: 0, deleted: 0, hasMore: false }])
    await expect(
      cleanupSupersededVoteBallots(1, NOW, undefined, ['unknown_votes']),
    ).rejects.toThrow('Unknown ballot table')
  })

  it('does no retention work when every family has completed', async () => {
    const page = await runVoteRetentionCleanupPage(
      { batchSize: 1, maxBatches: 1 },
      { voteTables: [], userAgentStrings: false, voteIntegrityDetails: false },
    )
    expect(page).toEqual({
      supersededVoteBallots: [],
      orphanedUserAgentStrings: { scanned: 0, deleted: 0, hasMore: false },
      voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
    })
  })

  it('rejects pages beyond the per-run read bound before querying a table', async () => {
    const scopedIds = [uuidv7(), uuidv7()]
    await expect(cleanupSupersededVoteBallotTable('post_votes', 5_001)).rejects.toThrow(RangeError)
    await expect(cleanupOrphanedUserAgentStrings(5_001)).rejects.toThrow(RangeError)
    await expect(cleanupVoteIntegrityDetails(5_001)).rejects.toThrow(RangeError)
    await expect(cleanupSupersededVoteBallotTable('post_votes', 1, NOW, scopedIds)).rejects.toThrow(
      RangeError,
    )
    await expect(cleanupOrphanedUserAgentStrings(1, scopedIds)).rejects.toThrow(RangeError)
  })

  it('deletes only ballots superseded for 90 days and keeps the newest ballot', async () => {
    const { userId, postId } = await postForTest()
    const firstDay = new Date(Date.UTC(2023, 0, 1 + randomInt(730)))
    const firstDayText = firstDay.toISOString().slice(0, 10)
    const firstId = uuidv7({ msecs: firstDay.getTime() })
    const secondId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    const recentId = uuidv7({ msecs: Date.parse('2026-10-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, firstId)
    await insertTestPostVote(postId, userId, '127.0.0.1', -1, secondId)
    await insertTestPostVote(postId, userId, '127.0.0.1', 1, recentId)

    const retainedBefore = await getTestRetainedPostVoteCount(firstDayText)
    const engagementBefore = await getEngagement('all', new Date(0))

    const page = await cleanupSupersededVoteBallotTable('post_votes', 3, NOW, [
      firstId,
      secondId,
      recentId,
    ])
    expect(page).toMatchObject({ scanned: 3, deleted: 1, hasMore: false })
    expect(await getTestPostVoteIds(postId, userId)).toEqual([secondId, recentId])
    expect(await getTestRetainedPostVoteCount(firstDayText)).toBe(retainedBefore + 1)
    const engagementAfter = await getEngagement('all', new Date(0))
    const dayCount = (engagement: typeof engagementAfter) =>
      engagement.votes_over_time.find(point => point.date === firstDayText)?.count ?? 0
    expect(dayCount(engagementAfter)).toBe(dayCount(engagementBefore))
    expect(await cleanupSupersededVoteBallotTable('post_votes', 1, NOW, [firstId])).toMatchObject({
      deleted: 0,
    })
    expect(await getTestRetainedPostVoteCount(firstDayText)).toBe(retainedBefore + 1)
  })

  it('drains a long actor history in bounded pages before retiring its superseder', async () => {
    const { userId, postId } = await postForTest()
    const olderDays = [
      '2023-01-01T00:00:00.000Z',
      '2024-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
    ]
    const olderIds = olderDays.map(day => uuidv7({ msecs: Date.parse(day) }))
    const supersederId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    for (const id of olderIds) {
      await insertTestPostVote(postId, userId, '127.0.0.1', 1, id)
    }
    await insertTestPostVote(postId, userId, '127.0.0.1', -1, supersederId)
    const countsBefore = await Promise.all(
      olderDays.map(day => getTestRetainedPostVoteCount(day.slice(0, 10))),
    )

    const pages = []
    while (pages.length < olderIds.length) {
      pages.push(await cleanupSupersededVoteBallotTable('post_votes', 1, NOW, [supersederId]))
    }
    expect(pages.map(page => page.deleted)).toEqual([1, 1, 1])
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false])
    expect(await getTestPostVoteIds(postId, userId)).toEqual([supersederId])
    for (const [index, day] of olderDays.entries()) {
      expect(await getTestRetainedPostVoteCount(day.slice(0, 10))).toBe(countsBefore[index]! + 1)
    }
    expect(
      await cleanupSupersededVoteBallotTable('post_votes', 1, NOW, [supersederId]),
    ).toMatchObject({
      deleted: 0,
    })
  })

  it('revisits an unfinished superseder while keeping the sweep end fixed', async () => {
    const { userId, postId } = await postForTest()
    const olderIds = [
      '2028-01-01T00:00:00.000Z',
      '2029-01-01T00:00:00.000Z',
      '2030-01-01T00:00:00.000Z',
    ].map(day => uuidv7({ msecs: Date.parse(day) }))
    const beforeSupersederId = uuidv7({ msecs: Date.parse('2031-01-31T00:00:00.000Z') })
    const supersederId = uuidv7({ msecs: Date.parse('2031-02-01T00:00:00.000Z') })
    const futureNow = new Date('2031-06-01T00:00:00.000Z')

    await using query = await beginTransaction()
    await resetTestVoteBallotCleanupCursor(query, 'post_votes', beforeSupersederId)
    for (const id of olderIds) {
      await insertTestPostVote(postId, userId, '127.0.0.1', 1, id, query)
    }
    await insertTestPostVote(postId, userId, '127.0.0.1', -1, supersederId, query)

    const first = await cleanupSupersededVoteBallotTable(
      'post_votes',
      1,
      futureNow,
      undefined,
      query,
    )
    expect(first).toMatchObject({ scanned: 2, deleted: 1, hasMore: true })
    const frozenCutoffId = (await getTestVoteBallotCleanupCursor(query, 'post_votes'))
      .sweep_cutoff_id
    expect(await getTestVoteBallotCleanupCursor(query, 'post_votes')).toEqual({
      cursor_vote_id: beforeSupersederId,
      sweep_cutoff_id: frozenCutoffId,
    })
    const pages = [first]
    while (pages.length < olderIds.length) {
      const page = await cleanupSupersededVoteBallotTable(
        'post_votes',
        1,
        new Date(futureNow.getTime() + 10 * 24 * 60 * 60 * 1_000),
        undefined,
        query,
      )
      expect(page.scanned).toBeLessThanOrEqual(2)
      pages.push(page)
      expect((await getTestVoteBallotCleanupCursor(query, 'post_votes')).sweep_cutoff_id).toBe(
        page.hasMore ? frozenCutoffId : null,
      )
    }
    expect(pages.map(page => page.deleted)).toEqual([1, 1, 1])
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false])
    expect(await getTestPostVoteIds(postId, userId, query)).toEqual([supersederId])
    expect(await getTestVoteBallotCleanupCursor(query, 'post_votes')).toEqual({
      cursor_vote_id: supersederId,
      sweep_cutoff_id: null,
    })
    expect(
      await cleanupSupersededVoteBallotTable('post_votes', 1, futureNow, undefined, query),
    ).toMatchObject({ scanned: 0, deleted: 0, hasMore: false })
    expect((await getTestVoteBallotCleanupCursor(query, 'post_votes')).sweep_cutoff_id).toBeNull()
  })

  it('removes an orphan user agent and keeps one referenced by a session', async () => {
    const { userId } = await postForTest()
    const orphanId = await upsertUserAgentString(`orphan-${randomUUID()}`)
    const retainedAgent = `session-${randomUUID()}`
    const referencedId = await upsertUserAgentString(retainedAgent)
    if (!orphanId || !referencedId) throw new Error('User-agent fixture was not created')
    const session = await insertTestUserSession({ userId, userAgent: retainedAgent })
    const afterAgeGuard = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)

    const freshPage = await cleanupOrphanedUserAgentStrings(2, [orphanId, referencedId])
    expect(freshPage).toMatchObject({ scanned: 0, deleted: 0, hasMore: false })
    expect(await hasTestUserAgentString(orphanId)).toBe(true)

    const page = await cleanupOrphanedUserAgentStrings(2, [orphanId, referencedId], afterAgeGuard)
    expect(page).toMatchObject({ scanned: 2, deleted: 1, hasMore: false })
    expect(await hasTestUserAgentString(orphanId)).toBe(false)
    expect(await hasTestUserAgentString(referencedId)).toBe(true)
    expect(await cleanupOrphanedUserAgentStrings(2, [referencedId], afterAgeGuard)).toMatchObject({
      scanned: 0,
      deleted: 0,
    })

    const laterOrphanId = await upsertUserAgentString(`later-orphan-${randomUUID()}`)
    if (!laterOrphanId) throw new Error('Later orphan fixture was not created')
    expect(await cleanupOrphanedUserAgentStrings(1, [laterOrphanId], afterAgeGuard)).toMatchObject({
      scanned: 1,
      deleted: 1,
    })
    await deleteTestUserSession(session.id)
    const released = await cleanupOrphanedUserAgentStrings(2, [referencedId], afterAgeGuard)
    expect(released).toMatchObject({ scanned: 1, deleted: 1, hasMore: false })
    expect(await hasTestUserAgentString(referencedId)).toBe(false)
  })

  it('keeps a user agent referenced by a ballot until retention deletes that ballot', async () => {
    const { postId, userId } = await postForTest()
    const agentId = await upsertUserAgentString(`ballot-${randomUUID()}`)
    if (!agentId) throw new Error('User-agent fixture was not created')
    const afterAgeGuard = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)
    const oldId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') })
    const supersederId = uuidv7({ msecs: Date.parse('2026-01-02T00:00:00.000Z') })
    await insertTestPostVoteWithUserAgent(postId, userId, agentId, 1, oldId)
    await insertTestPostVote(postId, userId, '127.0.0.1', -1, supersederId)

    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard)).toMatchObject({
      scanned: 1,
      deleted: 0,
    })
    expect(await hasTestUserAgentString(agentId)).toBe(true)

    await cleanupSupersededVoteBallotTable('post_votes', 5, NOW, [supersederId])
    expect(await getTestPostVoteIds(postId, userId)).toEqual([supersederId])
    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard)).toMatchObject({
      scanned: 1,
      deleted: 1,
    })
    expect(await hasTestUserAgentString(agentId)).toBe(false)
  })

  it('redacts identifying details after 180 days while retaining the flag', async () => {
    const { postId } = await postForTest()
    const flagId = await insertTestVoteIntegrityFlag({
      postId,
      flagType: 'ip_correlation',
      id: uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') }),
      details: {
        correlated_ips: [{ ip_address: '203.0.113.99', distinct_user_count: 3 }],
        device_id: randomUUID(),
        threshold: 3,
      },
    })
    const page = await cleanupVoteIntegrityDetails(1, NOW, [flagId])
    expect(page).toMatchObject({ scanned: 1, redacted: 1, hasMore: false })
    expect(await getTestVoteIntegrityFlagDetails(flagId)).toEqual({ threshold: 3 })
  })
})
