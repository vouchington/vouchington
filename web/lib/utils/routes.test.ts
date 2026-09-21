import { describe, it, expect } from 'vitest'
import { isBackendPath, shouldBypassProxyPath } from './routes'

describe('isBackendPath', () => {
  it('returns false for page paths', () => {
    expect(isBackendPath('/')).toBe(false)
    expect(isBackendPath('/discussions')).toBe(false)
    expect(isBackendPath('/discussions/create')).toBe(false)
    expect(isBackendPath('/login')).toBe(false)
    expect(isBackendPath('/profile/settings')).toBe(false)
  })

  it('returns true for /api/ prefix routes', () => {
    expect(isBackendPath('/api/v1/session')).toBe(true)
    expect(isBackendPath('/api/v1/auth/logout')).toBe(true)
    expect(isBackendPath('/api/')).toBe(true)
  })

  it('returns true for /infra/ prefix routes', () => {
    expect(isBackendPath('/infra/health')).toBe(true)
    expect(isBackendPath('/infra/')).toBe(true)
  })

  it('returns true for exact /sitemap.xml', () => {
    expect(isBackendPath('/sitemap.xml')).toBe(true)
  })

  it('returns true only for exact OAuth authorization-server paths', () => {
    for (const pathname of ['/authorize', '/register', '/revoke', '/token']) {
      expect(isBackendPath(pathname)).toBe(true)
    }
    expect(isBackendPath('/oauth/consent')).toBe(false)
    expect(isBackendPath('/authorize/help')).toBe(false)
    expect(isBackendPath('/tokenized')).toBe(false)
  })

  it('returns false for paths that start with /sitemap.xml but are not exact', () => {
    expect(isBackendPath('/sitemap.xml/something')).toBe(false)
  })

  it('returns true for /sitemaps/ prefix routes', () => {
    expect(isBackendPath('/sitemaps/discussion/2026-03-04/index.xml')).toBe(true)
    expect(isBackendPath('/sitemaps/')).toBe(true)
  })

  it('returns false for paths that contain backend route names but are not matches', () => {
    expect(isBackendPath('/my-api')).toBe(false)
    expect(isBackendPath('/api-docs')).toBe(false)
  })
})

describe('shouldBypassProxyPath', () => {
  it('returns true for Next.js internals', () => {
    expect(shouldBypassProxyPath('/_next/static/chunks/app.js')).toBe(true)
    expect(shouldBypassProxyPath('/_next/image')).toBe(true)
    expect(shouldBypassProxyPath('/_next/hmr')).toBe(true)
  })

  it('returns true for non-backend static assets', () => {
    expect(shouldBypassProxyPath('/favicon.ico')).toBe(true)
    expect(shouldBypassProxyPath('/images/logo.png')).toBe(true)
    expect(shouldBypassProxyPath('/manifest.webmanifest')).toBe(true)
  })

  it('returns true for local Storybook routes', () => {
    expect(shouldBypassProxyPath('/storybook')).toBe(true)
    expect(shouldBypassProxyPath('/storybook/')).toBe(true)
    expect(shouldBypassProxyPath('/storybook/iframe.html')).toBe(true)
  })

  it('returns false for app page routes', () => {
    expect(shouldBypassProxyPath('/')).toBe(false)
    expect(shouldBypassProxyPath('/discussions')).toBe(false)
    expect(shouldBypassProxyPath('/users/jane.doe')).toBe(false)
  })

  it('returns false for backend routes even when they look like files', () => {
    expect(shouldBypassProxyPath('/api/openapi.json')).toBe(false)
    expect(shouldBypassProxyPath('/sitemap.xml')).toBe(false)
  })
})
