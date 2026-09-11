import { describe, expect, it, vi } from 'vitest'

import storybookPagesAuthWorker, {
  serveStorybookPages,
  type StorybookPagesEnv,
} from './storybook-pages-auth.mts'

function basic(value: string): string {
  return `Basic ${btoa(value)}`
}

function createEnv(
  fetchAssets: (request: Request) => Response | Promise<Response>,
  credentials: string | null = 'alice:secret',
): StorybookPagesEnv {
  return {
    ASSETS: { fetch: request => Promise.resolve(fetchAssets(request)) },
    ...(credentials === null ? {} : { BASIC_AUTH_CREDENTIALS: credentials }),
  }
}

describe('Storybook Pages Basic Auth worker', () => {
  it('fails closed without a valid credential binding and never fetches assets', async () => {
    const fetchAssets = vi.fn<(request: Request) => Promise<Response>>()

    for (const credentials of [null, '', 'alice:secret,bad']) {
      const response = await serveStorybookPages(
        new Request('https://voucha-storybook.pages.dev/', {
          headers: { authorization: basic('alice:secret') },
        }),
        createEnv(fetchAssets, credentials),
      )
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
    expect(fetchAssets).not.toHaveBeenCalled()
  })

  it('challenges missing and incorrect request credentials without fetching assets', async () => {
    const fetchAssets = vi.fn<(request: Request) => Promise<Response>>()

    for (const authorization of [undefined, basic('alice:wrong')]) {
      const response = await serveStorybookPages(
        new Request('https://voucha-storybook.pages.dev/', {
          ...(authorization ? { headers: { authorization } } : {}),
        }),
        createEnv(fetchAssets),
      )
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe(
        'Basic realm="Voucha Internal References", charset="UTF-8"',
      )
    }
    expect(fetchAssets).not.toHaveBeenCalled()
  })

  it('fails closed when the Pages asset binding is missing', async () => {
    const response = await serveStorybookPages(
      new Request('https://voucha-storybook.pages.dev/', {
        headers: { authorization: basic('alice:secret') },
      }),
      { BASIC_AUTH_CREDENTIALS: 'alice:secret' },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ code: 'ASSETS_BINDING_MISSING' })
  })

  it('strips Authorization before serving assets and disables response caching', async () => {
    const fetchAssets = vi.fn<(request: Request) => Promise<Response>>(request => {
      expect(request.headers.has('authorization')).toBe(false)
      return Promise.resolve(new Response('storybook'))
    })
    const response = await serveStorybookPages(
      new Request('https://voucha-storybook.pages.dev/', {
        headers: { authorization: basic('alice:secret') },
      }),
      createEnv(fetchAssets),
    )

    expect(fetchAssets).toHaveBeenCalledOnce()
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Authorization')
  })

  it('preserves the Storybook asset response status, headers, and body', async () => {
    const response = await serveStorybookPages(
      new Request('https://voucha-storybook.pages.dev/missing', {
        headers: { authorization: basic('alice:secret') },
      }),
      createEnv(
        () =>
          new Response('missing', {
            status: 404,
            statusText: 'Not Found',
            headers: { 'x-storybook': 'asset' },
          }),
      ),
    )

    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
    expect(response.headers.get('x-storybook')).toBe('asset')
    await expect(response.text()).resolves.toBe('missing')
  })

  it('serves requests through the default Pages worker entry point', async () => {
    const response = await storybookPagesAuthWorker.fetch(
      new Request('https://voucha-storybook.pages.dev/', {
        headers: { authorization: basic('alice:secret') },
      }),
      createEnv(() => new Response('storybook')),
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('storybook')
  })
})
