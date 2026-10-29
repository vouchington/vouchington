import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { createTestUserDirect, insertTestUserSession } from '@voucha/test-helpers'
import {
  hasTestUserAgentStringCleanupCandidate,
  runTestUserAgentReleaseBeforeCleanup,
  runTestUserAgentReleaseDuringCleanup,
} from '../../../test-helpers/user-agent-cleanup-release-race.mts'
import { cleanupOrphanedUserAgentStrings } from '../cleanup-user-agent-strings.mts'

async function sessionWithUserAgent() {
  const user = await createTestUserDirect()
  if (!user) throw new Error('Failed to create a user-agent release fixture')
  const userAgent = `release-race-${randomUUID()}`
  const agentId = await upsertUserAgentString(userAgent)
  if (!agentId) throw new Error('Failed to create the user-agent string')
  const session = await insertTestUserSession({ userId: user.id, userAgent })
  const afterAgeGuard = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)
  return { agentId, sessionId: session.id, afterAgeGuard }
}

describe('user-agent cleanup and reference release', () => {
  it('requeues when the final session is released during the orphan check', async () => {
    const { agentId, sessionId, afterAgeGuard } = await sessionWithUserAgent()
    const { page, releaseBlocked } = await runTestUserAgentReleaseDuringCleanup({
      sessionId,
      cleanup: query => cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard, query),
    })
    expect(releaseBlocked).toBe(true)
    expect(page).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await hasTestUserAgentStringCleanupCandidate(agentId)).toBe(true)
    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard)).toMatchObject({
      scanned: 1,
      deleted: 1,
    })
  })

  it('keeps a candidate while the final session release is uncommitted', async () => {
    const { agentId, sessionId, afterAgeGuard } = await sessionWithUserAgent()
    const page = await runTestUserAgentReleaseBeforeCleanup({
      sessionId,
      cleanup: () => cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard),
    })
    expect(page).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await hasTestUserAgentStringCleanupCandidate(agentId)).toBe(true)
    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterAgeGuard)).toMatchObject({
      scanned: 1,
      deleted: 1,
    })
  })
})
