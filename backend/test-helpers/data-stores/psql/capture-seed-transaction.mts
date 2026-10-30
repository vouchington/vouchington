import * as psql from '@data-stores/psql'
import type { OwnedTransaction } from '@data-stores/psql'
import { vi } from 'vitest'

export type CapturedSeedStatement = {
  text: string
  values: readonly unknown[]
}

/**
 * Records statements passed to the next `beginTransaction` without opening a database
 * transaction. The caller restores the spy.
 */
export function captureSeedTransaction(): {
  calls: CapturedSeedStatement[]
  restore: () => void
} {
  const calls: CapturedSeedStatement[] = []
  const transaction = Object.assign(
    async (statement: string, values?: readonly unknown[]) => {
      calls.push({ text: statement, values: values ?? [] })
      return { rows: [], rowCount: 0 }
    },
    {
      commit: async () => {},
      rollback: async () => {},
      [Symbol.asyncDispose]: async () => {},
    },
  )
  const spy = vi.spyOn(psql, 'beginTransaction').mockImplementation(async () => {
    return transaction as unknown as OwnedTransaction
  })
  return { calls, restore: () => spy.mockRestore() }
}
