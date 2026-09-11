import http from 'node:http'
import { describe, expect, it } from 'vitest'
import { createFetchSafeTestServer, isFetchForbiddenTestPort } from './fetch-safe-test-server.mts'

function getResponseText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, response => {
        response.setEncoding('utf8')
        let body = ''
        response.on('data', chunk => {
          body += chunk
        })
        response.on('end', () => resolve(body))
      })
      .on('error', reject)
  })
}

describe('createFetchSafeTestServer', () => {
  it('binds a localhost server on a fetch-allowed port', async () => {
    const server = await createFetchSafeTestServer((_req, res) => {
      res.end('ok')
    })

    try {
      expect(server.port).toBeGreaterThan(0)
      expect(isFetchForbiddenTestPort(server.port)).toBe(false)
      await expect(getResponseText(server.url('/health'))).resolves.toBe('ok')
    } finally {
      await server.close()
    }
  })

  it('formats IPv6 origins as valid URLs', async () => {
    const server = await createFetchSafeTestServer(
      (_req, res) => {
        res.end('ok')
      },
      { host: '::1' },
    )

    try {
      expect(new URL(server.origin).hostname).toBe('[::1]')
      await expect(getResponseText(server.url('/health'))).resolves.toBe('ok')
    } finally {
      await server.close()
    }
  })

  it('tracks ports that Fetch rejects before opening a socket', () => {
    expect(isFetchForbiddenTestPort(6667)).toBe(true)
    expect(isFetchForbiddenTestPort(10080)).toBe(true)
    expect(isFetchForbiddenTestPort(49152)).toBe(false)
  })

  it('fails instead of spinning forever when bind attempts are exhausted', async () => {
    await expect(
      createFetchSafeTestServer(
        (_req, res) => {
          res.end('unused')
        },
        { maxBindAttempts: 0 },
      ),
    ).rejects.toThrow('failed to bind a fetch-safe test server after 0 attempts')
  })
})
