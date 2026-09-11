import { describe, expect, it, vi } from 'vitest'
import { TOPICS_IMAGE_EXISTS_GUARD_UNREGISTERED } from '@modules/on-error/error-codes'

describe('image-exists-guard-registry', () => {
  it('throws a coded error when no guard has been registered', async () => {
    vi.resetModules()
    const { getRegisteredImageExistsGuard } = await import('./image-exists-guard-registry.mts')

    let caughtError: unknown
    try {
      getRegisteredImageExistsGuard()
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as { status?: number }).status).toBe(500)
    expect((caughtError as { code?: string }).code).toBe(TOPICS_IMAGE_EXISTS_GUARD_UNREGISTERED)
  })
})
