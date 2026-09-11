import { describe, expect, it } from 'vitest'
import { ownsReportResolutionTransaction } from './transaction-ownership.mts'

describe('ownsReportResolutionTransaction', () => {
  it('owns default and pool-backed transactions', async () => {
    expect(await ownsReportResolutionTransaction(undefined)).toBe(true)
    expect(
      await ownsReportResolutionTransaction({ client: { connect: () => undefined } as never }),
    ).toBe(true)
  })

  it('does not own caller-provided transaction queries or in-transaction clients', async () => {
    expect(
      await ownsReportResolutionTransaction({ query: async () => ({ rows: [] }) as never }),
    ).toBe(false)

    const queries: string[] = []
    const client = {
      query: async (text: string) => {
        queries.push(text)
        return { rows: [] }
      },
    }

    expect(await ownsReportResolutionTransaction({ client: client as never })).toBe(false)
    expect(queries).toEqual([
      'SAVEPOINT voucha_report_resolution_probe',
      'RELEASE SAVEPOINT voucha_report_resolution_probe',
    ])
  })

  it('checks transaction state before treating checked-out clients as pools', async () => {
    const queries: string[] = []
    const client = {
      connect: () => undefined,
      release: () => undefined,
      query: async (text: string) => {
        queries.push(text)
        return { rows: [] }
      },
    }

    expect(await ownsReportResolutionTransaction({ client: client as never })).toBe(false)
    expect(queries).toEqual([
      'SAVEPOINT voucha_report_resolution_probe',
      'RELEASE SAVEPOINT voucha_report_resolution_probe',
    ])
  })

  it('owns checked-out clients that are not already in a transaction', async () => {
    const client = {
      query: async () => {
        const error = new Error('no transaction') as Error & { code: string }
        error.code = '25P01'
        throw error
      },
    }

    expect(await ownsReportResolutionTransaction({ client: client as never })).toBe(true)
  })
})
