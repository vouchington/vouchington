import { test, expect } from '../helpers/test.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { originOrFallback } from '../config/config-helpers.mts'

const expectedAssetOrigin = (() => {
  const origin = originOrFallback(process.env.NEXT_PUBLIC_ASSET_PREFIX ?? '', '')
  return origin === '' ? undefined : origin
})()

function fixedAssetOriginConflictsWithPage(pageOrigin: string): boolean {
  const page = new URL(pageOrigin)
  return (
    expectedAssetOrigin === 'http://localhost' &&
    page.hostname === 'localhost' &&
    (page.port === '' || page.port === '80')
  )
}

function expectedCspAssetSource(pageOrigin: string): string {
  if (expectedAssetOrigin && expectedAssetOrigin !== pageOrigin) return expectedAssetOrigin
  return `'self'`
}

test.describe('Cloudflare Worker', () => {
  test('preserves OAuth popup messaging across a committed cross-origin provider page', async ({
    context,
    page,
  }) => {
    await navigateTo(page, '/')
    const workerOrigin = new URL(page.url()).origin
    const callbackUrl = `${workerOrigin}/auth/callback/github?code=playwright-code&state=playwright-state`

    await page.evaluate(() => {
      const output = document.createElement('output')
      output.dataset.pw = 'oauth-popup-message'
      document.body.append(output)
      window.addEventListener('message', event => {
        if (
          event.origin !== window.location.origin &&
          event.origin !== 'https://oauth-provider.example'
        )
          return
        output.textContent = JSON.stringify(event.data)
      })
    })
    await context.route(/^https:\/\/oauth-provider\.example\/authorize/, route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>Provider redirect</title><script>
          window.opener.postMessage({ phase: 'provider-loaded' }, '*')
          window.location.replace(${JSON.stringify(callbackUrl)})
        </script>`,
      }),
    )

    const popupPromise = page.waitForEvent('popup')
    await page.evaluate(() => window.open('https://oauth-provider.example/authorize'))
    const popup = await popupPromise
    await popup.waitForURL(callbackUrl)

    await expect(page.getByTestId('oauth-popup-message')).toContainText(
      '"provider":"github","code":"playwright-code","state":"playwright-state","error":null',
    )
  })

  test.describe('asset routing', () => {
    test('static assets use the active asset origin', async ({ page }) => {
      await navigateTo(page, '/')

      const assetUrls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[src], link[href]')).map(element =>
          element instanceof HTMLScriptElement ? element.src : (element as HTMLLinkElement).href,
        )
      })

      const nextAssets = assetUrls.filter(url => url.includes('/_next/static/'))
      expect(nextAssets.length).toBeGreaterThan(0)
      const pageOrigin = new URL(page.url()).origin
      const assetOrigin = expectedAssetOrigin ?? pageOrigin
      expect(fixedAssetOriginConflictsWithPage(pageOrigin)).toBe(false)
      for (const url of nextAssets) {
        expect(new URL(url).origin).toBe(assetOrigin)
      }
    })

    test('font files load successfully with CORS headers', async ({ page }) => {
      const fontResponses: { url: string; status: number; corsHeader: string | null }[] = []

      page.on('response', response => {
        if (response.url().includes('.woff2')) {
          fontResponses.push({
            url: response.url(),
            status: response.status(),
            corsHeader: response.headers()['access-control-allow-origin'] ?? null,
          })
        }
      })

      await navigateTo(page, '/')

      // At least one font file should have loaded
      expect(fontResponses.length).toBeGreaterThan(0)
      const pageOrigin = new URL(page.url()).origin
      const assetOrigin = expectedAssetOrigin ?? pageOrigin
      expect(fixedAssetOriginConflictsWithPage(pageOrigin)).toBe(false)
      for (const font of fontResponses) {
        expect(font.status).toBe(200)
        expect(new URL(font.url).origin).toBe(assetOrigin)
        expect(font.corsHeader).toBe('*')
      }
    })

    test('CSP allows asset loading from the active origin', async ({ page }) => {
      const response = await page.goto('/')
      const csp = response?.headers()['content-security-policy'] ?? ''
      const pageOrigin = new URL(page.url()).origin
      const requiredSource = expectedCspAssetSource(pageOrigin)

      expect(csp).toContain(`script-src`)
      for (const directive of ['script-src', 'style-src', 'font-src', 'connect-src']) {
        const match = csp.match(new RegExp(`${directive} [^;]*`))
        expect(match, `${directive} should exist in CSP`).toBeTruthy()
        expect(match![0], `${directive} should allow the active asset origin`).toContain(
          requiredSource,
        )
      }
    })
  })
})
