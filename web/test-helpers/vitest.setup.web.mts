/* oxlint-disable vitest/require-top-level-describe -- Vitest setup files register lifecycle hooks at module scope. */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installJsdomStubs, installMemoryLocalStorage } from 'vouchington-tooling/jsdom-stubs'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'
import { flushPendingDynamicImports } from '@/test-helpers/components/topics/next-link-dynamic-mocks'

// Pre-seeds the client-side translation cache before any mock test mounts a component, so
// `useTranslations()` resolves synchronously instead of suspending on the first render. Without
// this, any codemod-migrated component suspends on `loadJsonMessages('en')` — production closes
// this window via a server-rendered bootstrap script (`seedFromWindowBootstrap`), which jsdom has
// no equivalent for. 'en' is hardcoded (not `DEFAULT_UI_LOCALE`) to mirror the Storybook preview
// seed: every mock test's default `UiLocaleProvider` context value renders English.
seedMessages('en', await loadJsonMessages('en'))

// Next.js treats `server-only` as a compile/runtime boundary marker. Vitest imports server
// components directly in jsdom, so mock the marker module while preserving production imports.
vi.mock(import('server-only'), () => ({}))

// UI unit tests use seeded catalogs. Tests of an uncached request must supply their
// own response fixture instead of contacting the localization service.
vi.mock(import('@/lib/api/client/localization'), () => ({
  getWebLocalizationBatchClient: vi
    .fn<typeof import('@/lib/api/client/localization').getWebLocalizationBatchClient>()
    .mockRejectedValue(
      new Error('Unseeded localization request: provide a test catalog or request fixture'),
    ),
}))

// Unit tests assert the dev/test fallback URL shape unless a test explicitly
// stubs IMAGE_ORIGIN. Local `.env` may set it for server startup.
function stubDefaultImageOrigin() {
  vi.stubEnv('IMAGE_ORIGIN', undefined)
}

stubDefaultImageOrigin()
beforeEach(stubDefaultImageOrigin)

// input-otp password-manager detection can fire after jsdom teardown and crash on a missing
// window. Mock its browser boundary globally; derive slots from each input’s actual length.
vi.mock(import('input-otp'), async () => {
  const React = await import('react')
  const { inputOtpMockFactory } = await import('vouchington-tooling/input-otp-mock')
  const mock = (await inputOtpMockFactory()) as unknown as typeof import('input-otp')
  const SharedOtpInput = mock.OTPInput
  const OTPInput = React.forwardRef<
    React.ElementRef<typeof SharedOtpInput>,
    React.ComponentPropsWithoutRef<typeof SharedOtpInput>
  >(function ProductOtpInputMock(props, ref) {
    const emptySlot = { char: '', placeholderChar: null, hasFakeCaret: false, isActive: false }
    return React.createElement(
      mock.OTPInputContext.Provider,
      {
        value: {
          slots: Array.from({ length: props.maxLength }, () => ({ ...emptySlot })),
          isFocused: false,
          isHovering: false,
        },
      },
      React.createElement(SharedOtpInput, { ...props, ref }),
    )
  })
  OTPInput.displayName = 'ProductOtpInputMock'
  return { ...mock, OTPInput }
})

// Cloudflare Turnstile needs a real widget + live siteverify, which jsdom cannot provide. Mock the
// token hook so content-creation forms (post, comment, topic recommendation, community, report)
// receive a ready token by default and their submit buttons enable. The presentational
// <TurnstileField> is left unmocked, so its `data-pw="turnstile-container"` still renders. Tests
// that exercise the real hook override this via vi.mock(..., importActual) (see
// web/hooks/__tests__/use-turnstile-token.mock.test.ts).
vi.mock(import('@/hooks/use-turnstile-token'), () => {
  const noop = () => {}
  return {
    useTurnstileToken: () => ({
      token: 'test-turnstile-token',
      alwaysApprove: false,
      reset: noop,
      containerRef: noop,
      isError: false,
    }),
  }
})

// reCAPTCHA Enterprise v3 mints a token at submit time via grecaptcha.enterprise.execute, which
// requires a live site key + Google endpoint jsdom cannot provide. Mock the token hook so
// content-creation forms (post, comment, discuss-in-community) receive a ready token by default.
// Tests that exercise the real hook override this via vi.mock(..., importActual).
vi.mock(import('@/hooks/use-recaptcha-token'), () => ({
  useRecaptchaToken: () => ({
    execute: () => Promise.resolve('test-recaptcha-token'),
  }),
}))

installJsdomStubs()
installMemoryLocalStorage()

// Clean up DOM after each test to prevent test pollution. Flush dynamic imports after
// unmount so a next/dynamic loader cannot still be evaluating login-url or another module
// when Vitest tears jsdom down.
afterEach(async () => {
  localStorage.clear()
  cleanup()
  await flushPendingDynamicImports()
})
