import { describe, expect, it, vi } from 'vitest'
import { WIKIPEDIA_TOPIC_RECOMMENDATIONS_APPROVED_HANDLER_UNREGISTERED } from '@modules/on-error/error-codes'
import type { RecommendationApprovedHandler } from './recommendation-approved-handler-registry.mts'

describe('recommendation-approved-handler-registry', () => {
  it('throws a coded error when no handler has been registered', async () => {
    vi.resetModules()
    const { getRegisteredRecommendationApprovedHandler } =
      await import('./recommendation-approved-handler-registry.mts')

    let caughtError: unknown
    try {
      getRegisteredRecommendationApprovedHandler()
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as { status?: number }).status).toBe(500)
    expect((caughtError as { code?: string }).code).toBe(
      WIKIPEDIA_TOPIC_RECOMMENDATIONS_APPROVED_HANDLER_UNREGISTERED,
    )
  })

  it('returns the handler after registerRecommendationApprovedHandler runs', async () => {
    vi.resetModules()
    const { registerRecommendationApprovedHandler, getRegisteredRecommendationApprovedHandler } =
      await import('./recommendation-approved-handler-registry.mts')

    const handler = vi.fn<RecommendationApprovedHandler>().mockResolvedValue(undefined)
    registerRecommendationApprovedHandler(handler)

    expect(getRegisteredRecommendationApprovedHandler()).toBe(handler)
  })
})
