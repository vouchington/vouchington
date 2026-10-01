import { describe, expect, it, vi } from 'vitest'
import { resolveSessionPlan } from './rest-usage-meter.mts'

type Owner = { membership_plan: 'plus' | 'pro' | null }

function dependencies(loadOwner: () => Promise<Owner | null>) {
  return {
    loadOwner: vi.fn<(userId: string) => Promise<Owner | null>>(loadOwner),
    reportError: vi.fn<(error: Error) => void>(),
  }
}

describe('resolveSessionPlan', () => {
  it('reuses the user the route already loaded without reading it again', async () => {
    const deps = dependencies(() => Promise.resolve({ membership_plan: 'pro' }))

    await expect(
      resolveSessionPlan('user-1', { id: 'user-1', membership_plan: 'plus' }, deps),
    ).resolves.toBe('plus')

    expect(deps.loadOwner).not.toHaveBeenCalled()
  })

  it('reads the user by id when the route loaded none or loaded someone else', async () => {
    const deps = dependencies(() => Promise.resolve({ membership_plan: 'pro' }))

    await expect(resolveSessionPlan('user-1', undefined, deps)).resolves.toBe('pro')
    await expect(resolveSessionPlan('user-1', null, deps)).resolves.toBe('pro')
    await expect(
      resolveSessionPlan('user-1', { id: 'user-2', membership_plan: 'plus' }, deps),
    ).resolves.toBe('pro')

    expect(deps.loadOwner).toHaveBeenCalledTimes(3)
    expect(deps.loadOwner).toHaveBeenCalledWith('user-1')
  })

  it('is the free plan for a user with no membership or no record', async () => {
    const member = dependencies(() => Promise.resolve({ membership_plan: null }))
    const missing = dependencies(() => Promise.resolve(null))

    await expect(resolveSessionPlan('user-1', undefined, member)).resolves.toBe('free')
    await expect(resolveSessionPlan('user-1', undefined, missing)).resolves.toBe('free')

    expect(member.reportError).not.toHaveBeenCalled()
    expect(missing.reportError).not.toHaveBeenCalled()
  })

  it('fails open to the free plan and reports a failed read', async () => {
    const failure = new Error('read replica unavailable')
    const deps = dependencies(() => Promise.reject(failure))

    await expect(resolveSessionPlan('user-1', undefined, deps)).resolves.toBe('free')

    expect(deps.reportError).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('reports a non-Error failure as an Error', async () => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- A read may reject with any value.
    const deps = dependencies(() => Promise.reject('connection reset'))

    await expect(resolveSessionPlan('user-1', undefined, deps)).resolves.toBe('free')

    expect(deps.reportError).toHaveBeenCalledExactlyOnceWith(new Error('connection reset'))
  })
})
