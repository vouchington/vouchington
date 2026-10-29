import { performance } from 'node:perf_hooks'

/** Only fixed phase names and monotonic durations are public; command arguments remain private. */
export async function withMigrationControlTiming<Result>(
  statement: string,
  deadline: number,
  command: () => Promise<Result>,
): Promise<Result> {
  const phase = statement.startsWith('CREATE DATABASE')
    ? 'create-database'
    : statement.includes('identifyOwnedMigrationDatabase')
      ? 'identify-database'
      : statement.startsWith('DROP DATABASE')
        ? 'drop-database'
        : 'ownership-or-closure-query'
  const started = performance.now()
  try {
    return await command()
  } finally {
    console.log(
      `[migration-control] phase=${phase} elapsed_ms=${Math.round(performance.now() - started)} remaining_ms=${Math.max(0, Math.round(deadline - performance.now()))}`,
    )
  }
}
