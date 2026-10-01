import { describe, expect, it } from 'vitest'
import { countTestUserAgentStrings } from '../../test-helpers/entities/user-sessions.mts'
import { runTestActionsAcrossUserAgentConflict } from '../../test-helpers/services/jwt-session/concurrent-user-agent.mts'
import { upsertUserAgentString } from './upsert-user-agent-string.mts'

describe('user-agent string lookup', () => {
  it('shares the same row after a concurrent first-use conflict', async () => {
    const userAgent = `user-agent-race-${crypto.randomUUID()}`
    const [firstId, secondId] = await runTestActionsAcrossUserAgentConflict(
      options => upsertUserAgentString(userAgent, options),
      () => upsertUserAgentString(userAgent),
    )
    expect(firstId).toBeTruthy()
    expect(secondId).toBe(firstId)
    await expect(countTestUserAgentStrings(userAgent)).resolves.toBe(1)
  })
  it('normalizes bounded strings and distinguishes absent from explicitly empty agents', async () => {
    await expect(upsertUserAgentString(null)).resolves.toBeNull()
    await expect(upsertUserAgentString(undefined)).resolves.toBeNull()
    const emptyId = await upsertUserAgentString('')
    expect(emptyId).toBeTruthy()
    await expect(upsertUserAgentString('  ')).resolves.toBe(emptyId)
    const prefix = crypto.randomUUID()
    const bounded = prefix.padEnd(1023, 'a')
    const firstId = await upsertUserAgentString(`  ${bounded} trailing  `)
    expect(firstId).toBeTruthy()
    await expect(upsertUserAgentString(bounded)).resolves.toBe(firstId)
    await expect(countTestUserAgentStrings(bounded)).resolves.toBe(1)
  })
})
