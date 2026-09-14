import { beforeAll, describe, it, expect, afterEach, vi } from 'vitest'
import createHttpError from 'http-errors'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import * as bloomFilterEnqueues from '@queues/bloom-filters/enqueues'
import * as flushModule from '@services/valkey-admin/flush'
import * as queuesFlushModule from './queues-flush.mts'

const flushConcernMock = vi.spyOn(flushModule, 'flushConcern')
const flushQueuesMock = vi.spyOn(queuesFlushModule, 'flushQueues')
const enqueueRebuildEmbeddingBloomFilterMock = vi.spyOn(
  bloomFilterEnqueues,
  'enqueueRebuildEmbeddingBloomFilter',
)

describe('POST /api/v1/valkey/flush', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  afterEach(() => {
    flushConcernMock.mockReset()
    flushQueuesMock.mockReset()
    enqueueRebuildEmbeddingBloomFilterMock.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/valkey/flush').send({ concern: 'caches' }).expect(401)

    expect(flushConcernMock).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-administrator user', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.post('/api/v1/valkey/flush').send({ concern: 'caches' }).expect(403)

    expect(flushConcernMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid concern', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request.post('/api/v1/valkey/flush').send({ concern: 'not-a-concern' }).expect(400)

    expect(flushConcernMock).not.toHaveBeenCalled()
  })

  it('delegates to flushConcern and returns its result for a non-queues concern', async () => {
    flushConcernMock.mockResolvedValue({ concern: 'caches', keysRemoved: null })

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request
      .post('/api/v1/valkey/flush')
      .send({ concern: 'caches' })
      .expect(200)

    expect(flushConcernMock).toHaveBeenCalledWith('caches', { force: false })
    expect(response.body).toEqual({ concern: 'caches', keysRemoved: null })
  })

  it('plumbs force: true through to flushConcern for the sessions concern', async () => {
    flushConcernMock.mockResolvedValue({ concern: 'sessions', keysRemoved: 9 })

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request
      .post('/api/v1/valkey/flush')
      .send({ concern: 'sessions', force: true })
      .expect(200)

    expect(flushConcernMock).toHaveBeenCalledWith('sessions', { force: true })
    expect(response.body).toEqual({ concern: 'sessions', keysRemoved: 9 })
  })

  it('propagates a 400 rejected by flushConcern (e.g. sessions without force)', async () => {
    flushConcernMock.mockRejectedValue(
      createHttpError(400, 'Flushing sessions requires force: true'),
    )

    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request.post('/api/v1/valkey/flush').send({ concern: 'sessions' }).expect(400)
  })

  it('delegates to flushQueues (not flushConcern) for the queues concern', async () => {
    flushQueuesMock.mockResolvedValue({ concern: 'queues', keysRemoved: null })

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request
      .post('/api/v1/valkey/flush')
      .send({ concern: 'queues' })
      .expect(200)

    expect(flushQueuesMock).toHaveBeenCalledTimes(1)
    expect(flushConcernMock).not.toHaveBeenCalled()
    expect(response.body).toEqual({ concern: 'queues', keysRemoved: null })
  })

  it('uses the embedding-specific rebuild enqueue', async () => {
    enqueueRebuildEmbeddingBloomFilterMock.mockResolvedValue(undefined as never)

    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request
      .post('/api/v1/valkey/bloom-filters/rebuild')
      .send({ filter: 'embedding' })
      .expect(200)

    expect(enqueueRebuildEmbeddingBloomFilterMock).toHaveBeenCalledOnce()
  })
})
