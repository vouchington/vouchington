import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTraceProxy } from '../integration-tests/web/helpers/backend-trace-proxy.mts'

const originalTraceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
let proxy: Awaited<ReturnType<typeof createTraceProxy>>

describe('web-integration asset metadata cache', () => {
  beforeEach(async () => {
    proxy = await createTraceProxy(0, 'http://127.0.0.1:1')
    process.env.WEB_INTEGRATION_TRACE_ORIGIN = proxy.origin
    vi.resetModules()
  })

  afterEach(async () => {
    await proxy.close()
    if (originalTraceOrigin === undefined) {
      delete process.env.WEB_INTEGRATION_TRACE_ORIGIN
    } else {
      process.env.WEB_INTEGRATION_TRACE_ORIGIN = originalTraceOrigin
    }
  })

  it('collapses concurrent requests for the same static asset', async () => {
    const { fetchAssetMetadataCached } =
      await import('../integration-tests/web/helpers/asset-metadata-cache.mts')
    let resolveResponse: (response: Response) => void = () => {}
    const response = new Promise<Response>(resolve => {
      resolveResponse = resolve
    })
    const fetchAsset = vi.fn<(url: string) => Promise<Response>>(() => response)

    const first = fetchAssetMetadataCached('/_next/static/shared.js', fetchAsset)
    const second = fetchAssetMetadataCached('/_next/static/shared.js', fetchAsset)
    resolveResponse(
      new Response('asset', { headers: { 'content-type': 'application/javascript' } }),
    )

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 200, contentType: 'application/javascript' },
      { status: 200, contentType: 'application/javascript' },
    ])
    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  it('evicts rejected and non-successful requests', async () => {
    const { fetchAssetMetadataCached } =
      await import('../integration-tests/web/helpers/asset-metadata-cache.mts')
    const fetchAsset = vi
      .fn<(url: string) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('transport failure'))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValue(new Response('asset'))

    await expect(fetchAssetMetadataCached('/_next/static/retry.js', fetchAsset)).rejects.toThrow(
      'transport failure',
    )
    await expect(
      fetchAssetMetadataCached('/_next/static/retry.js', fetchAsset),
    ).resolves.toMatchObject({ status: 502 })
    await expect(
      fetchAssetMetadataCached('/_next/static/retry.js', fetchAsset),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetchAsset).toHaveBeenCalledTimes(3)
  })

  it('does not cache mutable owned assets', async () => {
    const { fetchAssetMetadataCached } =
      await import('../integration-tests/web/helpers/asset-metadata-cache.mts')
    const fetchAsset = vi.fn<(url: string) => Promise<Response>>().mockResolvedValue(new Response())

    await fetchAssetMetadataCached('/robots.txt', fetchAsset)
    await fetchAssetMetadataCached('/robots.txt', fetchAsset)

    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })

  it('holds one shared six-request budget and releases completed leases', async () => {
    const { createCrossProcessConcurrencyLimiter } =
      await import('../integration-tests/web/helpers/concurrency.mts')
    const run = createCrossProcessConcurrencyLimiter(proxy.origin)
    let active = 0
    let maximum = 0
    let releaseLeases: () => void = () => {}
    const holdLeases = new Promise<void>(resolve => {
      releaseLeases = resolve
    })

    const requests = Promise.all(
      Array.from({ length: 18 }, () =>
        run(async () => {
          active++
          maximum = Math.max(maximum, active)
          await holdLeases
          active--
        }),
      ),
    )

    let saturationError: unknown
    try {
      await vi.waitFor(() => expect(maximum).toBe(6), { timeout: 5_000 })
    } catch (error) {
      saturationError = error
    } finally {
      releaseLeases()
    }
    await requests
    if (saturationError) throw saturationError
    expect(maximum).toBe(6)
  })
})
