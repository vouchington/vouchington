import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Injected into the page to avoid connecting to a real push service in tests.
//
// Two things are stubbed:
//
// 1. `Notification.permission` and `Notification.requestPermission()` are forced
//    to `'granted'`. `context.grantPermissions(['notifications'])` updates the
//    Permissions API (`navigator.permissions.query({name: 'notifications'})`)
//    but does NOT update the legacy `Notification.permission` global in
//    headless Chromium, which still returns `'denied'`. The Enable handler
//    short-circuits with a "Push permission is blocked in this browser." toast
//    when `Notification.permission !== 'granted'`, so the click never reaches
//    the SW registration step. Overriding the property on the constructor
//    bypasses that branch.
//
// 2. `PushManager.prototype.subscribe` and `getSubscription` model one persistent
//    deterministic subscription so ownership reconciliation can verify the same
//    physical subscription without VAPID push-service connectivity.
const PUSH_SUBSCRIPTION_STUB = `
;(function () {
  if (typeof Notification !== 'undefined') {
    try {
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: function () { return 'granted' },
      })
    } catch {}
    Notification.requestPermission = function (cb) {
      if (typeof cb === 'function') cb('granted')
      return Promise.resolve('granted')
    }
  }

  var fakeEndpoint = 'https://push.example.com/playwright-push-test-fake-key-2634'
  var activeSubscription = null
  var fakeSubscription = {
    endpoint: fakeEndpoint,
    expirationTime: null,
    toJSON: function () {
      return {
        endpoint: fakeEndpoint,
        expirationTime: null,
        keys: {
          p256dh: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          auth: 'AAAAAAAA',
        },
      }
    },
    unsubscribe: function () {
      activeSubscription = null
      return Promise.resolve(true)
    },
  }
  if (typeof PushManager !== 'undefined') {
    PushManager.prototype.getSubscription = function () {
      return Promise.resolve(activeSubscription)
    }
    PushManager.prototype.subscribe = function () {
      activeSubscription = fakeSubscription
      return Promise.resolve(fakeSubscription)
    }
  }
})()
`

test.describe('My Notifications', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows inbox button and notifications settings page', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('inbox-open-button')).toBeVisible()

    await page.getByTestId('inbox-open-button').click()
    await expect(page.getByTestId('inbox-view-all-button')).toBeVisible()

    await page.getByTestId('inbox-view-all-button').click()
    await expect(page).toHaveURL(/\/my\/notifications/)
    await expect(page.getByTestId('notifications-page-heading')).toBeVisible()
    await expect(page.getByTestId('notification-list')).toBeVisible()
    await expect(page.getByTestId('push-notifications-heading')).toBeVisible()

    await page.getByTestId('notification-settings-link').click()
    await expect(page).toHaveURL('/my/notification-settings')
    await expect(page.getByTestId('moderation-email-timezone-select')).toBeVisible()
  })

  test('shows follow notification in inbox', async ({ page }) => {
    await navigateTo(page, '/my/notifications')

    // The seeded follow notification from test-friend should appear
    await expect(
      page
        .getByTestId('notification-item-title')
        .filter({ hasText: '@test-friend started following you' }),
    ).toBeVisible()
  })

  test('service worker registers and enable/disable push round-trip works', async ({
    page,
    context,
    browserName,
  }) => {
    // PushManager and service workers need Chromium; skip on other engines
    test.skip(browserName !== 'chromium', 'Push API only tested on Chromium')

    // Grant the Permissions API permission for the browser-internal checks
    // performed by serviceWorker.register() and PushManager.subscribe().
    // The init script below additionally forces `Notification.permission` to
    // `'granted'`, which `grantPermissions()` does not affect in headless
    // Chromium — see the PUSH_SUBSCRIPTION_STUB comment for details.
    await context.grantPermissions(['notifications'])
    await page.addInitScript(PUSH_SUBSCRIPTION_STUB)

    await navigateTo(page, '/my/notifications')

    // Initial state: push disabled
    await expect(page.getByTestId('push-notifications-status')).toContainText('disabled')
    await expect(page.getByTestId('push-notifications-enable-button')).toBeVisible()

    // Enable push — registers SW, calls stubbed subscribe(), saves to backend
    await page.getByTestId('push-notifications-enable-button').click()

    // UI should reflect enabled state — wait for this first so the React handler
    // has had a chance to register the service worker before we assert on it
    await expect(page.getByTestId('push-notifications-status')).toContainText('enabled')
    await expect(page.getByTestId('push-notifications-disable-button')).toBeVisible()

    // Verify the service worker was registered (poll because registration is async)
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration('/service-worker.js')
          return !!reg?.active || !!reg?.installing || !!reg?.waiting
        }),
      )
      .toBe(true)

    // Disable push — removes subscription from backend, updates UI
    await page.getByTestId('push-notifications-disable-button').click()

    await expect(page.getByTestId('push-notifications-status')).toContainText('disabled')
    await expect(page.getByTestId('push-notifications-enable-button')).toBeVisible()
  })
})
