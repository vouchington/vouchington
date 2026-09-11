import type { Page } from '@playwright/test'

/**
 * Why this exists: Cloudflare Turnstile is wired in unconditionally on /login
 * and loads challenges.cloudflare.com. The iframe's background traffic can
 * prevent `page.waitForLoadState('networkidle')` (the hydration signal in
 * `navigate-to.mts`) from settling within the 15s navigation timeout.
 *
 * The stub fulfills the Turnstile script with a synthetic `window.turnstile`
 * that resolves the widget synchronously with a fake token. All login-form
 * Playwright specs already mock `/api/v1/auth/email-address/tokens`, so the
 * fake token never reaches Cloudflare siteverify on the backend. The
 * synthetic widget keeps the contract that `useTurnstile` depends on (render,
 * reset, remove, getResponse) so submit buttons enable as they would with the
 * real always-pass test site key.
 */

const TURNSTILE_API_PATTERN = '**/turnstile/v0/api.js**'

const TURNSTILE_STUB_JS = `
;(function () {
  if (window.turnstile) return
  var fakeToken = 'PLAYWRIGHT_TURNSTILE_TOKEN'
  var handlers = new Map()
  window.turnstile = {
    render: function (container, params) {
      var id = 'pw-' + Math.random().toString(36).slice(2)
      container.replaceChildren()
      var widget = document.createElement('div')
      widget.setAttribute('role', 'group')
      widget.setAttribute('aria-label', 'Cloudflare Turnstile verification')
      widget.setAttribute('data-pw', 'turnstile-widget')
      widget.textContent = 'Cloudflare Turnstile verification'
      container.appendChild(widget)
      handlers.set(id, params)
      queueMicrotask(function () {
        try { params && params.callback && params.callback(fakeToken) } catch (_) {}
      })
      return id
    },
    reset: function (id) {
      var params = handlers.get(id)
      if (!params) return
      queueMicrotask(function () {
        try { params.callback && params.callback(fakeToken) } catch (_) {}
      })
    },
    remove: function (id) { handlers.delete(id) },
    getResponse: function () { return fakeToken },
  }
})();
`

const stubbedPages = new WeakSet<Page>()

export async function installTurnstileStub(page: Page): Promise<void> {
  if (stubbedPages.has(page)) return
  stubbedPages.add(page)
  await page.route(TURNSTILE_API_PATTERN, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: TURNSTILE_STUB_JS,
    }),
  )
}
