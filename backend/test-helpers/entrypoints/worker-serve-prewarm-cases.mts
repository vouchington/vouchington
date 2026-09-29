import { expect } from 'vitest'

import {
  bootWorkerServe,
  type RegisterWorkerServe,
  type ShutdownCallback,
} from './worker-serve-harness.mts'
import type { WorkerServeCase } from './worker-serve-cases.mts'

const prewarmEnv = { NODE_PREWARM: '1', NODE_PREWARM_PORT: '3099' }

export function prewarmWorkerServeCases(
  registerWorkerServe: RegisterWorkerServe,
): WorkerServeCase[] {
  return [
    {
      title: 'starts an HTTP server on NODE_PREWARM_PORT when NODE_PREWARM is set',
      run: () => {
        const shutdownCallbacks: ShutdownCallback[] = []
        const listenedPorts: number[] = []
        const closedServers: string[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          env: prewarmEnv,
          shutdownCallbacks,
          createServer: () => ({
            listen: (port?: number) => {
              listenedPorts.push(port ?? 0)
            },
            close: (callback?: () => void) => {
              closedServers.push('close')
              callback?.()
            },
            closeAllConnections: () => {
              closedServers.push('closeAllConnections')
            },
          }),
        })

        expect(listenedPorts).toEqual([3099])
        expect(shutdownCallbacks).toHaveLength(1)
        expect(processHandlers.has('uncaughtException')).toBe(true)
        expect(closedServers).toEqual([])
      },
    },
    {
      title: 'closes the prewarm server on graceful shutdown',
      run: async () => {
        const shutdownCallbacks: ShutdownCallback[] = []
        const closedServers: string[] = []
        bootWorkerServe(registerWorkerServe, {
          env: prewarmEnv,
          shutdownCallbacks,
          createServer: () => ({
            listen: () => {},
            close: (callback?: () => void) => {
              closedServers.push('close')
              callback?.()
            },
            closeAllConnections: () => {
              closedServers.push('closeAllConnections')
            },
          }),
        })

        await shutdownCallbacks[0]!()
        expect(closedServers).toEqual(['closeAllConnections', 'close'])
      },
    },
  ]
}
