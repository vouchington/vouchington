import { read } from './fixture-executor.mts'

/** A real query after early cursor exit proves the pool remains usable. */
export async function readBoundedCursorConnectionProbeForTest(): Promise<Array<{ ready: number }>> {
  return (await read<{ ready: number }>('/* boundedCursorClosed */ SELECT 1 AS ready')).rows
}
