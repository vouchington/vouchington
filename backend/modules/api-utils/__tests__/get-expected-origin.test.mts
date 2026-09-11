import { describe, expect, it } from 'vitest'
import { getExpectedOrigin } from '../get-expected-origin.mts'

const TEST_WORKER_SECRET = 'trusted-worker-secret-that-is-at-least-32-chars'
const UPDATED_WORKER_SECRET = 'updated-worker-secret-that-is-at-least-32-chars'

describe('getExpectedOrigin', () => {
  it('combines x-forwarded-proto and host when the worker secret matches', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({ 'x-forwarded-proto': 'https', host: 'example.com' }),
      }),
    )
    expect(result).toBe('https://example.com')
  })

  it('ignores forwarded headers when the worker secret is missing', () => {
    const result = getExpectedOrigin({
      headers: {
        'x-forwarded-host': 'evil.example.com',
        'x-forwarded-proto': 'https',
        host: 'example.com',
      },
    })
    expect(result).toBe('http://example.com')
  })

  it('ignores forwarded headers when the worker secret does not match', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: {
          'x-cf-worker-secret': 'wrong-secret',
          'x-forwarded-host': 'evil.example.com',
          'x-forwarded-proto': 'https',
          host: 'example.com',
        },
      }),
    )
    expect(result).toBe('http://example.com')
  })

  it('refreshes the cached expected-secret hash when the worker secret changes', () => {
    const originalResult = withWorkerSecret(TEST_WORKER_SECRET, () =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'original.example.com',
          'x-forwarded-proto': 'https',
          host: 'backend.example.com',
        }),
      }),
    )
    const staleResult = withWorkerSecret(UPDATED_WORKER_SECRET, () =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'stale.example.com',
          'x-forwarded-proto': 'https',
          host: 'backend.example.com',
        }),
      }),
    )
    const updatedResult = withWorkerSecret(UPDATED_WORKER_SECRET, () =>
      getExpectedOrigin({
        headers: {
          ...trustedHeaders({
            'x-forwarded-host': 'updated.example.com',
            'x-forwarded-proto': 'https',
            host: 'backend.example.com',
          }),
          'x-cf-worker-secret': UPDATED_WORKER_SECRET,
        },
      }),
    )
    expect(originalResult).toBe('https://original.example.com')
    expect(staleResult).toBe('http://backend.example.com')
    expect(updatedResult).toBe('https://updated.example.com')
  })

  it('prefers x-forwarded-host over backend host', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'localhost:54879',
          'x-forwarded-proto': 'https',
          host: 'localhost:54876',
        }),
      }),
    )
    expect(result).toBe('https://localhost:54879')
  })

  it('defaults proto to http outside production when x-forwarded-proto is missing', () => {
    const result = getExpectedOrigin({
      headers: { host: 'example.com' },
    })
    expect(result).toBe('http://example.com')
  })

  it('defaults proto to https in production when x-forwarded-proto is missing', () => {
    const originalNodeEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      const result = getExpectedOrigin({
        headers: { host: 'example.com' },
      })
      expect(result).toBe('https://example.com')
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('defaults host to empty string when missing', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({ 'x-forwarded-proto': 'http' }),
      }),
    )
    expect(result).toBe('http://')
  })

  it('takes the first element when x-forwarded-proto is an array', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({ 'x-forwarded-proto': ['http', 'https'], host: 'example.com' }),
      }),
    )
    expect(result).toBe('http://example.com')
  })

  it('takes the first element when x-forwarded-host is an array', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': ['example.com', 'backend.example.com'],
          'x-forwarded-proto': 'https',
        }),
      }),
    )
    expect(result).toBe('https://example.com')
  })

  it('takes the first comma-delimited x-forwarded-host token', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': ' app.example.com, proxy.local ',
          'x-forwarded-proto': 'https',
          host: 'backend.local',
        }),
      }),
    )
    expect(result).toBe('https://app.example.com')
  })

  it('takes the first comma-delimited x-forwarded-proto token', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com',
          'x-forwarded-proto': ' https, http ',
        }),
      }),
    )
    expect(result).toBe('https://app.example.com')
  })

  it('skips blank comma-delimited x-forwarded-host tokens', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': ' , app.example.com',
          'x-forwarded-proto': 'https',
          host: 'backend.local',
        }),
      }),
    )
    expect(result).toBe('https://app.example.com')
  })

  it('falls back when x-forwarded-host contains only blank tokens', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': ' , ',
          'x-forwarded-proto': 'https',
          host: 'backend.local',
        }),
      }),
    )
    expect(result).toBe('https://backend.local')
  })

  it('falls back when x-forwarded-proto contains only blank tokens', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com',
          'x-forwarded-proto': ' , ',
        }),
      }),
    )
    expect(result).toBe('http://app.example.com')
  })

  it('lowercases forwarded proto before composing the origin', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com',
          'x-forwarded-proto': 'HTTPS',
        }),
      }),
    )
    expect(result).toBe('https://app.example.com')
  })

  it('removes default ports from the composed origin', () => {
    const httpsResult = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com:443',
          'x-forwarded-proto': 'https',
        }),
      }),
    )
    const httpResult = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com:80',
          'x-forwarded-proto': 'http',
        }),
      }),
    )
    expect(httpsResult).toBe('https://app.example.com')
    expect(httpResult).toBe('http://app.example.com')
  })

  it('handles http proto', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({ 'x-forwarded-proto': 'http', host: 'localhost:3000' }),
      }),
    )
    expect(result).toBe('http://localhost:3000')
  })

  it('preserves non-http forwarded protos and ports unchanged', () => {
    const result = withTrustedWorker(() =>
      getExpectedOrigin({
        headers: trustedHeaders({
          'x-forwarded-host': 'app.example.com:8443',
          'x-forwarded-proto': 'webcal',
          host: 'localhost:3000',
        }),
      }),
    )
    expect(result).toBe('webcal://app.example.com:8443')
  })
})

function trustedHeaders(headers: Record<string, string | string[]>) {
  return { ...headers, 'x-cf-worker-secret': TEST_WORKER_SECRET }
}

function withTrustedWorker<T>(callback: () => T): T {
  return withWorkerSecret(TEST_WORKER_SECRET, callback)
}

function withWorkerSecret<T>(secret: string, callback: () => T): T {
  const originalSecret = process.env.CF_WORKER_SECRET
  try {
    process.env.CF_WORKER_SECRET = secret
    return callback()
  } finally {
    process.env.CF_WORKER_SECRET = originalSecret
  }
}
