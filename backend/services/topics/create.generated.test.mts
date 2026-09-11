import { it, expect, describe } from 'vitest'
import { createTopic } from './create.mts'
import { createTestUser } from '@voucha/test-helpers'

describe('create.generated', () => {
  it('createTopic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    expect(topic).toBeDefined()
  })

  it('createTopic with hostname string resolves and links hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const hostname = `create-test-${random}.example.com`
    const topic = await createTopic(user!, {
      name: `Hostname Topic ${random}`,
      slug: `hostname-topic-${random}`,
      hostname,
    })
    expect(topic).toBeDefined()
    expect(topic.hostname_id).not.toBeNull()
    expect(topic.hostname?.hostname).toBe(hostname)
  })

  it('createTopic with hostname null leaves topic unlinked', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, {
      name: `No Hostname Topic ${random}`,
      slug: `no-hostname-topic-${random}`,
      hostname: null,
    })
    expect(topic).toBeDefined()
    expect(topic.hostname_id).toBeNull()
  })
})
