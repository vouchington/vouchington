import { describe, expect, it, vi } from 'vitest'

import {
  findRateLimitNamespaceCollisions,
  runRateLimitNamespaceCollisionCli,
} from './check-rate-limit-namespace-collisions.mts'

const response = (result: unknown, resultInfo?: { page: number; total_pages: number }): Response =>
  Response.json({ success: true, result, result_info: resultInfo }, { status: 200 })

describe('findRateLimitNamespaceCollisions', () => {
  it('reports desired namespaces used by another Worker and ignores the target Worker', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    fetchImpl
      .mockResolvedValueOnce(
        response([{ id: 'other-worker' }, { id: 'voucha-cloudflare-worker-staging' }]),
      )
      .mockResolvedValueOnce(
        response({
          bindings: [
            { type: 'ratelimit', namespace_id: '719801' },
            { type: 'kv_namespace', namespace_id: '719802' },
          ],
        }),
      )

    await expect(
      findRateLimitNamespaceCollisions(
        'account',
        'token',
        'voucha-cloudflare-worker-staging',
        new Set(['719801', '719802']),
        fetchImpl,
      ),
    ).resolves.toEqual([{ script: 'other-worker', namespaceId: '719801' }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('checks Worker scripts from every API page', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    let resolveFirstPage!: (response: Response) => void
    const firstPage = new Promise<Response>(resolve => {
      resolveFirstPage = resolve
    })
    fetchImpl
      .mockReturnValueOnce(firstPage)
      .mockResolvedValueOnce(response([{ id: 'second-page-worker' }], { page: 2, total_pages: 2 }))
      .mockResolvedValueOnce(response({ bindings: [] }))
      .mockResolvedValueOnce(
        response({ bindings: [{ type: 'ratelimit', namespace_id: '719803' }] }),
      )

    const collisions = findRateLimitNamespaceCollisions(
      'account',
      'token',
      'target',
      new Set(['719803']),
      fetchImpl,
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    resolveFirstPage(response([{ id: 'first-page-worker' }], { page: 1, total_pages: 2 }))

    await expect(collisions).resolves.toEqual([
      { script: 'second-page-worker', namespaceId: '719803' },
    ])
    expect(fetchImpl.mock.calls[0]![0]).toContain('page=1&per_page=100')
    expect(fetchImpl.mock.calls[1]![0]).toContain('page=2&per_page=100')
  })

  it('fails closed when Cloudflare rejects account inspection', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ success: false, result: null, errors: ['denied'] }, { status: 403 }),
      )

    await expect(
      findRateLimitNamespaceCollisions(
        'account',
        'token',
        'target',
        new Set(['719801']),
        fetchImpl,
      ),
    ).rejects.toThrow('Cloudflare API request failed (403)')
  })

  it('fails closed when Cloudflare returns a 200 envelope with success: false', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ success: false, result: null, errors: ['denied'] }, { status: 200 }),
      )

    await expect(
      findRateLimitNamespaceCollisions(
        'account',
        'token',
        'target',
        new Set(['719801']),
        fetchImpl,
      ),
    ).rejects.toThrow('Cloudflare API request failed (200): ["denied"]')
  })

  it('surfaces the HTTP status and response body when Cloudflare returns a non-JSON error page', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(
      findRateLimitNamespaceCollisions(
        'account',
        'token',
        'target',
        new Set(['719801']),
        fetchImpl,
      ),
    ).rejects.toThrow(
      'Cloudflare API request failed (502): <html><body>502 Bad Gateway</body></html>',
    )
  })

  it('surfaces the HTTP status and body when Cloudflare returns a 200 with a non-JSON body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html><body>Attention Required! | Cloudflare</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(
      findRateLimitNamespaceCollisions(
        'account',
        'token',
        'target',
        new Set(['719801']),
        fetchImpl,
      ),
    ).rejects.toThrow('Cloudflare API returned a non-JSON response (200')
  })

  it('does nothing when imported', async () => {
    const check = vi.fn<typeof findRateLimitNamespaceCollisions>()
    const log = vi.fn<(message: string) => void>()
    await runRateLimitNamespaceCollisionCli({
      args: ['719801'],
      check,
      env: { CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'token' },
      isMain: false,
      log,
    })
    expect(check).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('requires Cloudflare credentials', async () => {
    await expect(
      runRateLimitNamespaceCollisionCli({
        args: ['719801'],
        check: vi.fn<typeof findRateLimitNamespaceCollisions>(),
        env: {},
        isMain: true,
        log: vi.fn<(message: string) => void>(),
      }),
    ).rejects.toThrow('Cloudflare account credentials are required')
  })

  it('requires at least one namespace ID', async () => {
    await expect(
      runRateLimitNamespaceCollisionCli({
        args: [],
        check: vi.fn<typeof findRateLimitNamespaceCollisions>(),
        env: { CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'token' },
        isMain: true,
        log: vi.fn<(message: string) => void>(),
      }),
    ).rejects.toThrow('At least one namespace ID is required')
  })

  it('fails with the exact collision details', async () => {
    const collisions = [{ namespaceId: '719801', script: 'other-worker' }]
    const check = vi.fn<typeof findRateLimitNamespaceCollisions>().mockResolvedValue(collisions)
    await expect(
      runRateLimitNamespaceCollisionCli({
        args: ['719801'],
        check,
        env: { CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'token' },
        isMain: true,
        log: vi.fn<(message: string) => void>(),
      }),
    ).rejects.toThrow(`Rate-limit namespace collision: ${JSON.stringify(collisions)}`)
  })

  it('checks unique namespace IDs for the staging Worker and reports success', async () => {
    const check = vi.fn<typeof findRateLimitNamespaceCollisions>().mockResolvedValue([])
    const log = vi.fn<(message: string) => void>()
    await runRateLimitNamespaceCollisionCli({
      args: ['719801', '719801', '719802'],
      check,
      env: { CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'token' },
      isMain: true,
      log,
    })
    expect(check).toHaveBeenCalledWith(
      'account',
      'token',
      'voucha-cloudflare-worker-staging',
      new Set(['719801', '719802']),
    )
    expect(log).toHaveBeenCalledWith(
      'Verified 2 rate-limit namespace IDs are unused by other Workers',
    )
  })
})
