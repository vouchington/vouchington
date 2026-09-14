/* oxlint-disable vitest/require-top-level-describe -- Vitest setup files register lifecycle hooks at module scope. */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'

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

// Unit tests assert the dev/test fallback URL shape unless a test explicitly
// stubs IMAGE_ORIGIN. Local `.env` may set it for server startup.
function stubDefaultImageOrigin() {
  vi.stubEnv('IMAGE_ORIGIN', undefined)
}

stubDefaultImageOrigin()
beforeEach(stubDefaultImageOrigin)

// input-otp schedules a setTimeout (password-manager keystroke detection) that fires
// after jsdom teardown when window no longer exists, crashing the process with
// "ReferenceError: window is not defined" even when all tests pass. Mock globally so
// every web test that mounts an InputOTP-using component is protected automatically.
vi.mock(import('input-otp'), async () => {
  const React = await import('react')
  const OTPInputContext = React.createContext({
    slots: Array.from({ length: 8 }, () => ({ char: '', hasFakeCaret: false, isActive: false })),
  })
  const forwardRef = React.forwardRef as any
  const OTPInput = forwardRef(function OTPInputMock(props: any, ref: any) {
    const { children, maxLength, onChange, containerClassName, pattern, ...rest } = props
    const normalizedPattern =
      typeof pattern === 'string' ? pattern : pattern instanceof RegExp ? pattern.source : undefined
    return React.createElement(
      'div',
      { 'data-input-otp': true, maxLength, className: containerClassName },
      React.createElement('input', {
        type: 'text',
        maxLength,
        ref,
        onChange: (e: any) => onChange?.(e.target.value),
        pattern: normalizedPattern,
        ...rest,
      }),
      children,
    )
  })
  OTPInput.displayName = 'OTPInput'
  return {
    OTPInput,
    OTPInputContext,
    REGEXP_ONLY_DIGITS: /^\d*$/,
    REGEXP_ONLY_DIGITS_AND_CHARS: /^[a-zA-Z0-9]*$/,
  } as unknown as typeof import('input-otp')
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

// jsdom does not implement scrollIntoView; stub globally so components using it don't crash
if (typeof window !== 'undefined' && window.HTMLElement.prototype.scrollIntoView === undefined) {
  window.HTMLElement.prototype.scrollIntoView = function () {}
}

// jsdom does not implement ResizeObserver; provide a no-op stub only if missing
if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement IntersectionObserver; Embla carousel requires it
if (globalThis.IntersectionObserver === undefined) {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
}

// jsdom does not implement matchMedia; Embla carousel requires it
if (typeof window !== 'undefined' && window.matchMedia === undefined) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

const memoryLocalStorage = createMemoryStorage()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: memoryLocalStorage,
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: memoryLocalStorage,
  })
}

// Clean up DOM after each test to prevent test pollution
afterEach(() => {
  localStorage.clear()
  cleanup()
})
