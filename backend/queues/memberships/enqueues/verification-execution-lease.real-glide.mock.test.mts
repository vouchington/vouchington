import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { runWithMembershipVerificationLeaseRenewal } from '../../../workers/memberships/processors/verification-execution-renewal.mts'
import { membershipVerificationQueueConfig } from '../config.mts'
import {
  acquireMembershipVerificationExecutionLease,
  membershipVerificationLeaseNamespace,
  releaseMembershipVerificationExecutionLease,
  renewMembershipVerificationExecutionLease,
  type MembershipVerificationExecutionLease,
} from './verification-execution-lease.mts'

// This project deliberately restores real GlideMQ instead of the default in-memory worker shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('membership verification execution lease with real Valkey', () => {
  it('bounds contention and fences renewal and release by owner token', async () => {
    const keys = [
      `${membershipVerificationLeaseNamespace}:slot:0`,
      `${membershipVerificationLeaseNamespace}:slot:1`,
    ]
    const restoreConfig = overrideDynamicConfigFieldsForTest(membershipVerificationQueueConfig, {
      verification_concurrency: 2,
    })
    try {
      const first = await acquireMembershipVerificationExecutionLease()
      const second = await acquireMembershipVerificationExecutionLease()
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      if (!first || !second) throw new Error('Expected two verification execution leases')
      expect(new Set([first.key, second.key])).toEqual(new Set(keys))
      await expect(acquireMembershipVerificationExecutionLease()).resolves.toBeNull()

      const forged: MembershipVerificationExecutionLease = {
        key: first.key,
        token: randomUUID(),
      }
      await expect(renewMembershipVerificationExecutionLease(forged)).resolves.toBe(false)
      await expect(releaseMembershipVerificationExecutionLease(forged)).resolves.toBe(false)
      await expect(workerQueueCommandClient.get(first.key)).resolves.toBe(first.token)

      await expect(renewMembershipVerificationExecutionLease(first)).resolves.toBe(true)
      const ttl = await workerQueueCommandClient.pttl(first.key)
      expect(ttl).toBeGreaterThan(50_000)
      expect(ttl).toBeLessThanOrEqual(60_000)
      await expect(
        runWithMembershipVerificationLeaseRenewal(first, async () => 'renewed'),
      ).resolves.toBe('renewed')

      await expect(releaseMembershipVerificationExecutionLease(first)).resolves.toBe(true)
      const operation = vi.fn<() => Promise<void>>(async () => undefined)
      await expect(runWithMembershipVerificationLeaseRenewal(first, operation)).rejects.toThrow(
        'lost ownership',
      )
      expect(operation).not.toHaveBeenCalled()
      await expect(releaseMembershipVerificationExecutionLease(second)).resolves.toBe(true)
      await expect(workerQueueCommandClient.get(second.key)).resolves.toBeNull()
    } finally {
      restoreConfig()
      await workerQueueCommandClient.unlink(keys)
    }
  })
})
