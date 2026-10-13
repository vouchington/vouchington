import { basename } from 'node:path'

const timeoutOptions = new Set([
  '--testTimeout',
  '--test-timeout',
  '--hookTimeout',
  '--hook-timeout',
])

/** Validate overrides without changing the command's argv or project defaults. */
export function validateVitestCliTimeouts(args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '--') break
    const equals = argument.indexOf('=')
    const option = equals < 0 ? argument : argument.slice(0, equals)
    const positiveOption = option.replace(/^--no-/u, '--')
    if (!timeoutOptions.has(positiveOption)) continue
    const raw = equals < 0 ? args[index + 1] : argument.slice(equals + 1)
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    if (option !== positiveOption || !Number.isFinite(value) || value <= 0 || value > 30_000) {
      throw new Error(`${option} must be a finite positive timeout at most 30000 ms`)
    }
    if (equals < 0) index += 1
  }
}

/** Ordinary commands may use similarly named options for unrelated purposes. */
export function validateVitestCommand(command: readonly string[]): void {
  const executable = basename(command[0] ?? '')
  if (executable === 'vitest' || executable === 'vitest.mjs') {
    validateVitestCliTimeouts(command.slice(1))
  } else if (executable === 'node' && basename(command[1] ?? '') === 'vitest.mjs') {
    validateVitestCliTimeouts(command.slice(2))
  }
}
