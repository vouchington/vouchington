import type { Server } from 'node:net'
import {
  listenOnRunnerUnreservedEphemeralPort as listenOnPolicyPort,
  loadRunnerPortPolicy,
  type EphemeralListenerOptions,
} from 'vouchington-tooling/runner-port-policy'

export type {
  EphemeralListenerOptions,
  RunnerPortPolicy,
} from 'vouchington-tooling/runner-port-policy'
export { EphemeralListenerAttemptsExhaustedError } from 'vouchington-tooling/runner-port-policy'

const policyPath = new URL('runner-port-policy.json', import.meta.url)

export const runnerPortPolicy = loadRunnerPortPolicy(policyPath)

export function isRunnerReservedPort(port: number): boolean {
  return port >= runnerPortPolicy.reservedPortStart && port <= runnerPortPolicy.reservedPortEnd
}

export function listenOnRunnerUnreservedEphemeralPort(
  server: Server,
  host: string,
  options: EphemeralListenerOptions = {},
): Promise<number> {
  return listenOnPolicyPort(server, host, { ...options, policy: runnerPortPolicy })
}
