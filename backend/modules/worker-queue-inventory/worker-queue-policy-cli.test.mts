import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { workerQueuePolicyCommandOutput } from './worker-queue-policy-cli.mts'
import {
  devWorkerCpuQueues,
  devWorkerIoQueues,
  formatQueueIncludeList,
  formatQueueSelection,
  workerQueuePolicy,
} from './worker-queue-policy.mts'

describe('worker queue inventory policy CLI', () => {
  it('prints dev queue selections', () => {
    expect(workerQueuePolicyCommandOutput('dev-cpu-queues')).toBe(
      formatQueueIncludeList(devWorkerCpuQueues()),
    )
    expect(workerQueuePolicyCommandOutput('dev-io-queues')).toBe(
      formatQueueSelection(devWorkerIoQueues(), workerQueuePolicy.ioCapableQueues),
    )
  })

  it('rejects unknown commands', () => {
    expect(() => workerQueuePolicyCommandOutput(undefined)).toThrow(
      'Unknown worker queue policy command',
    )
    expect(() => workerQueuePolicyCommandOutput('missing')).toThrow(
      'Unknown worker queue policy command: missing',
    )
  })

  it('runs before workspace dependencies are installed', () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), 'worker-queue-inventory-'))
    try {
      const isolatedPackage = join(isolatedRoot, 'worker-queue-inventory')
      cpSync(dirname(fileURLToPath(import.meta.url)), isolatedPackage, { recursive: true })

      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          join(isolatedPackage, 'worker-queue-policy-cli.mts'),
          'dev-cpu-queues',
        ],
        { encoding: 'utf8' },
      )

      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe(formatQueueIncludeList(devWorkerCpuQueues()))
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true })
    }
  })
})
