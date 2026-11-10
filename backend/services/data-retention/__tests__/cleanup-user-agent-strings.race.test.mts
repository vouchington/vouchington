import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import {
  createTestUserDirect,
  hasTestUserAgentString,
  insertTestUserSession,
} from '@voucha/test-helpers'
import { deleteTestUserSession } from '../../../test-helpers/entities/user-sessions.mts'
import { cleanupOrphanedUserAgentStrings } from '../cleanup-user-agent-strings.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('user-agent cleanup final state', () => {
  it('keeps a referenced agent past the grace window and deletes it after the session is gone', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create a user-agent fixture')
    const userAgent = `referenced-agent-${randomUUID()}`
    const agentId = await upsertUserAgentString(userAgent)
    if (!agentId) throw new Error('Failed to create the user-agent string')
    const session = await insertTestUserSession({ userId: user.id, userAgent })
    const afterGrace = new Date(Date.now() + 2 * DAY_MS)

    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterGrace)).toMatchObject({
      scanned: 1,
      deleted: 0,
    })
    expect(await hasTestUserAgentString(agentId)).toBe(true)

    await deleteTestUserSession(session.id)
    expect(await cleanupOrphanedUserAgentStrings(1, [agentId], afterGrace)).toMatchObject({
      scanned: 1,
      deleted: 1,
    })
    expect(await hasTestUserAgentString(agentId)).toBe(false)
  })

  it('leaves an orphan inside the one-day grace window', async () => {
    const agentId = await upsertUserAgentString(`fresh-orphan-${randomUUID()}`)
    if (!agentId) throw new Error('Failed to create the user-agent string')

    expect(await cleanupOrphanedUserAgentStrings(1, [agentId])).toMatchObject({
      scanned: 0,
      deleted: 0,
    })
    expect(await hasTestUserAgentString(agentId)).toBe(true)
  })
})
