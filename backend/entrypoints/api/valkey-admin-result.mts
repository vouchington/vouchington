import type { ServiceFlushConcern } from '@services/valkey-admin/concerns'
import type { FlushResult } from '@services/valkey-admin/flush'
import type { ValkeyDiagnosticResult } from '@services/valkey-admin/diagnostics'

export type ValkeyAdminEnvironment = 'staging' | 'production' | 'test'

export type ValkeyAdminCommandEnvironment = {
  ENVIRONMENT?: string
  NODE_ENV?: string
}

type ExecutableValkeyAdminCommand =
  | { operation: 'diagnose'; environment: ValkeyAdminEnvironment }
  | {
      operation: 'flush'
      environment: ValkeyAdminEnvironment
      concern: ServiceFlushConcern | 'queues'
      force: boolean
    }

export type ValkeyAdminOperationResult = ValkeyDiagnosticResult | FlushResult

export type ValkeyAdminRuntime = {
  diagnose(signal: AbortSignal): Promise<ValkeyDiagnosticResult>
  flushConcern(
    concern: ServiceFlushConcern,
    opts: { force: boolean; signal: AbortSignal },
  ): Promise<FlushResult>
  flushQueues(signal: AbortSignal): Promise<FlushResult>
  shutdown(): Promise<void>
}

export async function executeValkeyAdminOperation(
  command: ExecutableValkeyAdminCommand,
  runtime: ValkeyAdminRuntime,
  signal: AbortSignal,
): Promise<ValkeyAdminOperationResult> {
  signal.throwIfAborted()
  let operation: Promise<ValkeyAdminOperationResult>
  if (command.operation === 'diagnose') operation = runtime.diagnose(signal)
  else if (command.concern === 'queues') operation = runtime.flushQueues(signal)
  else operation = runtime.flushConcern(command.concern, { force: command.force, signal })
  return await operation
}

export function parseValkeyAdminEnvironment(
  env: ValkeyAdminCommandEnvironment,
): ValkeyAdminEnvironment {
  if (env.ENVIRONMENT === 'staging' || env.ENVIRONMENT === 'production') return env.ENVIRONMENT
  if (env.ENVIRONMENT === 'test' && env.NODE_ENV === 'test') return 'test'
  throw new Error('ENVIRONMENT must be staging or production')
}

export function emitValkeyAdminResult(
  stdout: (value: string) => void,
  command: ExecutableValkeyAdminCommand,
  result: ValkeyAdminOperationResult,
  now: () => Date,
  signal: AbortSignal,
): unknown {
  const identity = {
    schemaVersion: 1,
    operation: command.operation,
    environment: command.environment,
    timestamp: now().toISOString(),
  } as const
  try {
    signal.throwIfAborted()
    stdout(JSON.stringify({ ...result, ...identity }))
    return undefined
  } catch (error) {
    return error ?? new Error('Valkey admin result output failed')
  }
}
