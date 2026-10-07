import { describe, expect, it, vi } from 'vitest'
import { runLiveMcpCatalogCheck } from './live-mcp-catalog-check.mts'

describe('live MCP catalog check lifecycle', () => {
  it('checks only after startup and then closes every resource', async () => {
    const events: string[] = []
    await runLiveMcpCatalogCheck({
      ready: Promise.resolve(),
      check: () => {
        events.push('check')
      },
      closeResources: [
        async () => {
          events.push('valkey')
        },
        async () => {
          events.push('postgres')
        },
      ],
    })
    expect(events).toEqual(['check', 'valkey', 'postgres'])
  })

  it('retains the catalog failure and every cleanup failure', async () => {
    const contractError = new Error('tool metadata drift')
    const valkeyError = new Error('valkey close failed')
    const postgresError = new Error('postgres close failed')
    await expect(
      runLiveMcpCatalogCheck({
        ready: Promise.resolve(),
        check: () => {
          throw contractError
        },
        closeResources: [
          async () => {
            throw valkeyError
          },
          async () => {
            throw postgresError
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [contractError, valkeyError, postgresError],
    })
  })

  it('skips catalog validation after startup failure and still cleans up', async () => {
    const startupError = new Error('dynamic config failed')
    const check = vi.fn<() => void>()
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await expect(
      runLiveMcpCatalogCheck({
        ready: Promise.reject(startupError),
        check,
        closeResources: [close],
      }),
    ).rejects.toBe(startupError)
    expect(check).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })
})
