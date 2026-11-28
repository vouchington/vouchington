import { existsSync } from 'node:fs'
import { basename } from 'node:path'

type ExecFailure = {
  code?: number
  killed?: boolean
  signal?: NodeJS.Signals | null
  stdout?: string
  stderr?: string
}

export function isAbnormalExit(err: unknown): boolean {
  const failed = err as ExecFailure
  return typeof failed.code !== 'number' || Boolean(failed.killed) || Boolean(failed.signal)
}

// Which fixture markers exist tells the phase a hung child reached (none: startup or setup import;
// settling plus release: parked in the settle hook).
export function nestedVitestExitError(err: unknown, markerPaths: readonly string[]): Error {
  const failed = err as ExecFailure
  const output = `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`
  const markers = markerPaths.map(path => `${basename(path)}=${existsSync(path)}`).join(' ')
  return new Error(
    `Nested Vitest did not exit normally (killed=${String(failed.killed)} signal=${String(failed.signal)} markers: ${markers}):\n${output.slice(-4_000)}`,
    { cause: err },
  )
}
