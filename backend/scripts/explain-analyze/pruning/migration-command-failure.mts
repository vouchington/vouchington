import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect } from 'node:util'

// Preserve original rejection identity privately, never as a printable Error property/cause.
const commandCauses = new WeakMap<Error, unknown>()

export async function migrationCommandFailure(
  error: unknown,
  message: string,
  directory: string | undefined,
  ordinal: number,
): Promise<Error> {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  const signal =
    typeof error === 'object' && error !== null && 'signal' in error ? error.signal : undefined
  const failure = new Error(
    `${message}; private diagnostic directory: ${directory ?? 'unavailable'}`,
    {
      cause: {
        name: error instanceof Error ? 'Error' : typeof error,
        code:
          typeof code === 'number' || (typeof code === 'string' && /^[A-Z0-9_]{1,20}$/.test(code))
            ? code
            : undefined,
        signal: typeof signal === 'string' && /^SIG[A-Z0-9]+$/.test(signal) ? signal : undefined,
      },
    },
  )
  commandCauses.set(failure, error)
  // exec errors embed credential-bearing argv. Raw diagnostics stay private, outside CI output.
  if (directory) {
    try {
      await writeFile(
        join(directory, `command-failure-${ordinal}.log`),
        inspect(error, { depth: 4 }),
        { mode: 0o600 },
      )
    } catch (err) {
      return new AggregateError([failure, err], 'Could not retain private command diagnostics', {
        cause: failure,
      })
    }
  }
  return failure
}
