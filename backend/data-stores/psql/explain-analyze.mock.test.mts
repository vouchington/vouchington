import { describe, expect, it, vi } from 'vitest'
import type { PoolClient } from './index.mts'

describe('explainAnalyze setup failure', () => {
  it('reports missing function-tracking privilege and rolls back before preparing a query', async () => {
    const denied = new Error('permission denied to set parameter "track_functions"')
    const statements: string[] = []
    const client = {
      query: vi.fn<(input: string | { text: string }) => Promise<{ rows: never[] }>>(
        async input => {
          const statement = typeof input === 'string' ? input : input.text
          statements.push(statement)
          if (statement.includes('SET LOCAL track_functions')) throw denied
          return { rows: [] }
        },
      ),
      release: vi.fn<() => void>(),
    }
    vi.resetModules()
    vi.doMock<typeof import('@vouchington/postgres')>(
      import('@vouchington/postgres'),
      async importOriginal => ({
        ...(await importOriginal()),
        connectWithRetry: vi.fn<(typeof import('@vouchington/postgres'))['connectWithRetry']>(
          async () => client as unknown as PoolClient,
        ),
      }),
    )
    try {
      const { explainAnalyze } = await import('./explain-analyze.mts')
      await expect(explainAnalyze('unprivileged', 'SELECT 1')).rejects.toMatchObject({
        message: 'EXPLAIN requires SET privilege on track_functions',
        cause: denied,
      })
    } finally {
      vi.doUnmock('@vouchington/postgres')
    }
    expect(statements).toEqual([
      '/* explainAnalyze */ BEGIN',
      "/* explainAnalyze */ SET LOCAL track_functions = 'all'",
      '/* explainAnalyze */ ROLLBACK',
    ])
    expect(client.release).toHaveBeenCalledOnce()
  })
})
