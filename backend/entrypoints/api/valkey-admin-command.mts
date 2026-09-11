import { FLUSH_CONCERNS, isFlushConcern, type FlushConcern } from '@services/valkey-admin/concerns'
import {
  emitValkeyAdminResult,
  executeValkeyAdminOperation,
  parseValkeyAdminEnvironment,
  type ValkeyAdminCommandEnvironment,
  type ValkeyAdminEnvironment,
  type ValkeyAdminOperationResult,
  type ValkeyAdminRuntime,
} from './valkey-admin-result.mts'

export type { ValkeyAdminRuntime } from './valkey-admin-result.mts'

const VALKEY_ADMIN_USAGE = `Usage:
  valkey-admin.mts diagnose
  valkey-admin.mts flush <concern> --confirm "FLUSH <environment> VALKEY <concern>" [--force]
  valkey-admin.mts --help

Concerns: ${FLUSH_CONCERNS.join(', ')}`

export type ParsedValkeyAdminCommand =
  | { operation: 'help' }
  | { operation: 'diagnose'; environment: ValkeyAdminEnvironment }
  | {
      operation: 'flush'
      environment: ValkeyAdminEnvironment
      concern: FlushConcern
      force: boolean
    }

type CommandIO = {
  stdout(value: string): void
  stderr(value: string): void
}

class ValkeyAdminUsageError extends Error {}

export function parseValkeyAdminCommand(
  argv: readonly string[],
  env: ValkeyAdminCommandEnvironment,
): ParsedValkeyAdminCommand {
  if (argv.length === 1 && argv[0] === '--help') return { operation: 'help' }
  if (argv[0] === 'diagnose') {
    if (argv.length !== 1) throw new ValkeyAdminUsageError('diagnose accepts no arguments')
    return { operation: 'diagnose', environment: parseValkeyAdminEnvironment(env) }
  }
  if (argv[0] !== 'flush') {
    throw new ValkeyAdminUsageError(argv.length === 0 ? 'Missing command' : 'Unknown command')
  }

  const concern = argv[1]
  if (!concern || !isFlushConcern(concern)) {
    throw new ValkeyAdminUsageError('flush requires one valid concern')
  }

  let confirmation: string | undefined
  let force = false
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--force') {
      if (force) throw new ValkeyAdminUsageError('--force may be specified only once')
      force = true
      continue
    }
    if (argument === '--confirm') {
      if (confirmation !== undefined) {
        throw new ValkeyAdminUsageError('--confirm may be specified only once')
      }
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new ValkeyAdminUsageError('--confirm requires a confirmation phrase')
      }
      confirmation = value
      index += 1
      continue
    }
    throw new ValkeyAdminUsageError(`Unknown or misplaced argument: ${argument}`)
  }

  const environment = parseValkeyAdminEnvironment(env)
  const requiredConfirmation = `FLUSH ${environment} VALKEY ${concern}`
  if (confirmation !== requiredConfirmation) {
    throw new ValkeyAdminUsageError(`Confirmation must be exactly: ${requiredConfirmation}`)
  }
  if (concern === 'sessions' && !force) {
    throw new ValkeyAdminUsageError('Flushing sessions requires --force')
  }
  if (concern !== 'sessions' && force) {
    throw new ValkeyAdminUsageError('--force is allowed only for sessions')
  }

  return { operation: 'flush', environment, concern, force }
}

export async function runValkeyAdminCommand(
  argv: readonly string[],
  env: ValkeyAdminCommandEnvironment,
  loadRuntime: (
    registerPartialInitializationShutdown: (shutdown: ValkeyAdminRuntime['shutdown']) => void,
  ) => Promise<ValkeyAdminRuntime>,
  io: CommandIO = {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
  },
  now: () => Date = () => new Date(),
  cancellationSignal?: AbortSignal,
): Promise<number> {
  let command: ParsedValkeyAdminCommand
  try {
    command = parseValkeyAdminCommand(argv, env)
  } catch (error) {
    io.stderr(`${errorMessage(error)}\n\n${VALKEY_ADMIN_USAGE}`)
    return 2
  }

  if (command.operation === 'help') {
    io.stdout(VALKEY_ADMIN_USAGE)
    return 0
  }

  let runtime: ValkeyAdminRuntime | undefined
  let partialInitializationShutdown: ValkeyAdminRuntime['shutdown'] | undefined
  let result: ValkeyAdminOperationResult | undefined
  let operationalError: unknown
  const operationSignal = cancellationSignal ?? new AbortController().signal
  try {
    runtime = await loadRuntime(shutdown => {
      partialInitializationShutdown = shutdown
    })
    result = await executeValkeyAdminOperation(command, runtime, operationSignal)
    operationSignal.throwIfAborted()
  } catch (error) {
    operationalError = error
  }

  if (operationalError === undefined && result !== undefined) {
    operationalError = emitValkeyAdminResult(io.stdout, command, result, now, operationSignal)
  }

  const shutdown = runtime?.shutdown ?? partialInitializationShutdown
  if (shutdown) {
    try {
      await shutdown()
    } catch (error) {
      operationalError ??= error
    }
  }

  if (operationalError !== undefined || result === undefined) {
    io.stderr('Valkey admin operation failed')
    return 1
  }
  return 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
