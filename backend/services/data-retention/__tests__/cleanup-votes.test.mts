import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import {
  createTestUserDirect,
  getTestPostVoteIds,
  getTestVoteIntegrityFlagDetails,
  hasTestUserAgentString,
  insertTestPost,
  insertTestPostVote,
  insertTestUserSession,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import { cleanupSupersededVoteBallotTable } from '../cleanup-vote-ballots.mts'
import { cleanupOrphanedUserAgentStrings } from '../cleanup-user-agent-strings.mts'
import { cleanupVoteIntegrityDetails } from '../cleanup-vote-integrity-details.mts'

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
    const firstId = uuidv7({ msecs: Date.parse('2026-01-01T00:00:00.000Z') })
    const secondId = uuidv7({ msecs: Date.parse('2026-02-01T00:00:00.000Z') })
    const recentId = uuidv7({ msecs: Date.parse('2026-10-01T00:00:00.000Z') })
    await insertTestPostVote(postId, userId, 1, firstId)
    await insertTestPostVote(postId, userId, -1, secondId)
    await insertTestPostVote(postId, userId, 1, recentId)

    const page = await cleanupSupersededVoteBallotTable('post_votes', 3, NOW, [
      firstId,
      secondId,
      recentId,
    ])
    expect(page).toMatchObject({ scanned: 2, deleted: 1, hasMore: false })
    expect(await getTestPostVoteIds(postId, userId)).toEqual([secondId, recentId])
  })

  it('removes an orphan user agent and keeps one referenced by a session', async () => {
    const { userId } = await postForTest()
    const orphanId = await upsertUserAgentString(`orphan-${randomUUID()}`)
    const retainedAgent = `session-${randomUUID()}`
    const referencedId = await upsertUserAgentString(retainedAgent)
    if (!orphanId || !referencedId) throw new Error('User-agent fixture was not created')
    await insertTestUserSession({ userId, userAgent: retainedAgent })

    const page = await cleanupOrphanedUserAgentStrings(2, [orphanId, referencedId])
    expect(page).toMatchObject({ scanned: 2, deleted: 1, hasMore: false })
    expect(await hasTestUserAgentString(orphanId)).toBe(false)
    expect(await hasTestUserAgentString(referencedId)).toBe(true)
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
