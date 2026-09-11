import { describe, expect, it, vi } from 'vitest'
import { ENTITY_RELATION_ELECTION_HANDLER_UNREGISTERED } from '@modules/on-error/error-codes'
import type { ElectionVoteHandler } from './election-vote-handler-registry.mts'

describe('election-vote-handler-registry', () => {
  it('throws a coded error when no handler has been registered', async () => {
    vi.resetModules()
    const { getRegisteredElectionVoteHandler } =
      await import('./election-vote-handler-registry.mts')

    let caughtError: unknown
    try {
      getRegisteredElectionVoteHandler()
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as { status?: number }).status).toBe(500)
    expect((caughtError as { code?: string }).code).toBe(
      ENTITY_RELATION_ELECTION_HANDLER_UNREGISTERED,
    )
  })

  it('returns the registered handler after registerElectionVoteHandler is called', async () => {
    vi.resetModules()
    const { registerElectionVoteHandler, getRegisteredElectionVoteHandler } =
      await import('./election-vote-handler-registry.mts')

    const handler = vi.fn<ElectionVoteHandler>().mockResolvedValue(undefined)
    registerElectionVoteHandler(handler)

    expect(getRegisteredElectionVoteHandler()).toBe(handler)
  })
})
