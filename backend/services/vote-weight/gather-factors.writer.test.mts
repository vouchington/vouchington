import { afterEach, describe, expect, it, vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { createTestUserDirect } from '@voucha/test-helpers'

import { gatherVoteWeightFactors } from './gather-factors.mts'

function gatherCalls(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(([query]) => {
    const text = typeof query === 'string' ? query : (query as { text: string }).text
    return text.includes('/* gatherVoteWeightFactors */')
  }).length
}

describe('gatherVoteWeightFactors', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['reader', false, 1, 0],
    ['writer', true, 0, 1],
  ])('uses the %s pool when requested', async (_name, readFromWriter, readCalls, writeCalls) => {
    const user = await createTestUserDirect({
      username: `test-vote-weight-pool-${crypto.randomUUID().slice(0, 8)}`,
    })
    const readSpy = vi.spyOn(psql, 'read')
    const writeSpy = vi.spyOn(psql, 'write')

    await expect(gatherVoteWeightFactors(user!.id, { readFromWriter })).resolves.toMatchObject({
      oauthCount: 0,
      isAdmin: false,
      penaltyMultiplier: 1,
    })

    expect(gatherCalls(readSpy)).toBe(readCalls)
    expect(gatherCalls(writeSpy)).toBe(writeCalls)
  })
})
