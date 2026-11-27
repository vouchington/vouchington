import assert from 'node:assert/strict'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { apiKeyExpiryConfig } from '@services/api-keys/work-limits'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  insertTestApiKeysDueForReminder,
  getTestApiKeyLifecycle,
  setTestApiKeyExpiry,
} from '@voucha/test-helpers/entities/api-keys'
import { background } from '@queues/background/queues'
import {
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import { dispatchApiKeyExpiryReminders } from './api-key-expiry.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('API-key reminder sweep with real PostgreSQL and GlideMQ', () => {
  afterAll(() => background.close())

  it('persists every due key across a page boundary without claiming delivery', async () => {
    const owner = await createTestUser()
    const ids = await insertTestApiKeysDueForReminder(owner.id, 101)
    await dispatchApiKeyExpiryReminders()
    const jobs = (
      await Promise.all(QUEUE_STATES.map(state => background.getJobs(state, 0, -1)))
    ).flat()
    const ownIds = new Set(ids)
    const queued = jobs.filter(job => ownIds.has((job.data as { apiKeyId: string }).apiKeyId))
    expect(queued).toHaveLength(ids.length)
    expect(new Set(queued.map(job => (job.data as { apiKeyId: string }).apiKeyId)).size).toBe(
      ids.length,
    )
    expect(queued.every(job => job.name === EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB.name)).toBe(true)
    expect((await getTestApiKeyLifecycle(ids[0]!)).expiry_reminder_sent_at).toBeNull()
  })
  it('persists an expiry-and-ID cursor and reaches older keys with the same expiry', async () => {
    const owner = await createTestUser()
    const ids = (await insertTestApiKeysDueForReminder(owner.id, 3)).toSorted()
    const [second, third, first] = ids
    assert.ok(first && second && third)
    const firstExpiry = new Date(Date.now() + 86_400_000)
    const laterExpiry = new Date(firstExpiry.getTime() + 1)
    await Promise.all([
      setTestApiKeyExpiry(first, firstExpiry),
      setTestApiKeyExpiry(second, laterExpiry),
      setTestApiKeyExpiry(third, laterExpiry),
    ])
    overrideDynamicConfigFieldsForTest(apiKeyExpiryConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    const cursorFor = (expiry: Date, id: string) =>
      encodeScopedPreciseTimestampCursor(
        expiry.toISOString().replace('Z', '000Z'),
        id,
        'api-key-expiry-reminders',
      )
    await expect(
      dispatchApiKeyExpiryReminders({ afterId: cursorFor(firstExpiry, first) }),
    ).resolves.toEqual({ hasMore: true })
    const jobs = (
      await Promise.all(QUEUE_STATES.map(state => background.getJobs(state, 0, -1)))
    ).flat()
    expect(
      jobs.some(
        job =>
          job.name === EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB.name &&
          (job.data as { apiKeyId?: string }).apiKeyId === second,
      ),
    ).toBe(true)
    const continuation = jobs.find(
      job =>
        job.name === EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB.name &&
        (job.data as { afterId?: string }).afterId === cursorFor(laterExpiry, second),
    )
    expect(continuation).toBeDefined()
    await dispatchApiKeyExpiryReminders(continuation!.data as { afterId?: string })
    const tailJobs = (
      await Promise.all(QUEUE_STATES.map(state => background.getJobs(state, 0, -1)))
    ).flat()
    expect(
      tailJobs.some(
        job =>
          job.name === EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB.name &&
          (job.data as { apiKeyId?: string }).apiKeyId === third,
      ),
    ).toBe(true)
  })
})
