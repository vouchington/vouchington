import { describe, expect, it } from 'vitest'
import { buildWorkerQueueSettings } from './glide-mq-client.mts'

describe('glide-mq client settings', () => {
  it('buildWorkerQueueSettings parses host and port', () => {
    const result = buildWorkerQueueSettings('redis://localhost:6380')

    expect(result.connection).toMatchObject({
      addresses: [{ host: 'localhost', port: 6380 }],
    })
    expect(result.prefix).toBeUndefined()
  })

  it('buildWorkerQueueSettings maps TLS, credentials, and db path to prefix', () => {
    const result = buildWorkerQueueSettings('rediss://user:pa%24%24@cache.example.com:6379/7')

    expect(result.connection).toMatchObject({
      addresses: [{ host: 'cache.example.com', port: 6379 }],
      useTLS: true,
      credentials: {
        username: 'user',
        password: 'pa$$',
      },
    })
    expect(result.prefix).toBe('voucha_qdb_7')
  })

  it('buildWorkerQueueSettings rejects non-numeric db paths', () => {
    expect(() => buildWorkerQueueSettings('redis://localhost:6379/not-a-db')).toThrow(
      'Unsupported VALKEY_WORKER_QUEUE_URL path',
    )
  })

  it('buildWorkerQueueSettings defaults port to 6379', () => {
    const result = buildWorkerQueueSettings('redis://myhost')
    expect(result.connection.addresses[0]).toEqual({ host: 'myhost', port: 6379 })
  })

  it('buildWorkerQueueSettings omits prefix for db 0', () => {
    const result = buildWorkerQueueSettings('redis://localhost:6379/0')
    expect(result.prefix).toBeUndefined()
  })

  it('buildWorkerQueueSettings omits prefix for root path', () => {
    const result = buildWorkerQueueSettings('redis://localhost:6379/')
    expect(result.prefix).toBeUndefined()
  })

  it('buildWorkerQueueSettings handles password-only credentials', () => {
    const result = buildWorkerQueueSettings('redis://:secret@host:6379')
    expect(result.connection.credentials).toEqual({ password: 'secret' })
    expect(result.connection.credentials).not.toHaveProperty('username')
  })

  it('buildWorkerQueueSettings does not set credentials when absent', () => {
    const result = buildWorkerQueueSettings('redis://host:6379')
    expect(result.connection.credentials).toBeUndefined()
  })

  it('buildWorkerQueueSettings does not set useTLS for redis://', () => {
    const result = buildWorkerQueueSettings('redis://localhost:6379')
    expect(result.connection.useTLS).toBeUndefined()
  })

  it('buildWorkerQueueSettings handles production ElastiCache URL', () => {
    const result = buildWorkerQueueSettings(
      'rediss://default:token123@my-cluster.abc.use1.cache.amazonaws.com:6379/1',
    )
    expect(result.connection.useTLS).toBe(true)
    expect(result.connection.addresses[0]).toEqual({
      host: 'my-cluster.abc.use1.cache.amazonaws.com',
      port: 6379,
    })
    expect(result.connection.credentials).toEqual({ username: 'default', password: 'token123' })
    expect(result.prefix).toBe('voucha_qdb_1')
  })
})
