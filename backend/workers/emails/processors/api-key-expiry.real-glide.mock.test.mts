import { afterAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  insertTestApiKeysDueForReminder,
  getTestApiKeyLifecycle,
} from '@voucha/test-helpers/entities/api-keys'
import { emails } from '@queues/emails/queues'
import { dispatchApiKeyExpiryReminders } from './api-key-expiry.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('API-key reminder sweep with real PostgreSQL and GlideMQ', () => {
  afterAll(() => emails.close())

  it('persists every due key across a page boundary without claiming delivery', async () => {
    const owner = await createTestUser()
    const ids = await insertTestApiKeysDueForReminder(owner.id, 101)
    await dispatchApiKeyExpiryReminders()
    const jobs = (await Promise.all(QUEUE_STATES.map(state => emails.getJobs(state, 0, -1)))).flat()
    const ownIds = new Set(ids)
    const queued = jobs.filter(job => ownIds.has((job.data as { apiKeyId: string }).apiKeyId))
    expect(queued).toHaveLength(ids.length)
    expect(new Set(queued.map(job => (job.data as { apiKeyId: string }).apiKeyId)).size).toBe(
      ids.length,
    )
    expect(queued.every(job => job.name === 'processSendApiKeyExpiryReminder')).toBe(true)
    expect((await getTestApiKeyLifecycle(ids[0]!)).expiry_reminder_sent_at).toBeNull()
  })
})
