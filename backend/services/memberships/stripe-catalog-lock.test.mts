import { describe, expect, it, vi } from 'vitest'
import { withStripeCatalogReconciliationLock } from './stripe-catalog-lock.mts'

function lockClient(unlock: { unlocked: boolean } | Error) {
  const query = vi
    .fn<VitestLooseMock>()
    .mockResolvedValueOnce({ rows: [] })
    .mockReturnValueOnce(
      unlock instanceof Error ? Promise.reject(unlock) : Promise.resolve({ rows: [unlock] }),
    )
  const release = vi.fn<VitestLooseMock>()
  return { client: { query, release }, query, release }
}

describe('withStripeCatalogReconciliationLock', () => {
  it('destroys the client when PostgreSQL reports that the session lock was not held', async () => {
    const { client, query, release } = lockClient({ unlocked: false })
    const context = { environment: 'test' as const, applicationId: 'test-app' }

    await expect(
      withStripeCatalogReconciliationLock(
        context,
        async () => 'done',
        async () => client,
      ),
    ).rejects.toThrow('Stripe catalog reconciliation lock was not held at release')
    expect(query).toHaveBeenNthCalledWith(1, expect.any(String), [
      'stripe-membership-catalog:test:test-app',
    ])
    expect(release).toHaveBeenCalledWith(true)
  })

  it('keeps the operation error primary when releasing the session lock also fails', async () => {
    const unlockError = new Error('unlock failed')
    const { client, release } = lockClient(unlockError)
    const reportUnlockError = vi.fn<VitestLooseMock>()

    await expect(
      withStripeCatalogReconciliationLock(
        { environment: 'production', applicationId: 'test-app' },
        async () => {
          throw new Error('provider failed')
        },
        async () => client,
        reportUnlockError,
      ),
    ).rejects.toThrow('provider failed')
    expect(reportUnlockError).toHaveBeenCalledWith(unlockError)
    expect(release).toHaveBeenCalledWith(true)
  })
})
