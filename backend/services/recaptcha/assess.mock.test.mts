/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import type { PrivateUser } from '@services/users/types'
import type { RecaptchaConfig } from './config.mts'
import type { RecaptchaAssessment } from './fetch-assessment.mts'
import { assessRecaptchaToken, RECAPTCHA_BLOCK_MESSAGE } from './assess.mts'

const captureException = sentryCaptureExceptionMock

const mockGetRecaptchaConfig = vi.fn<() => RecaptchaConfig>()
const mockFetchAssessment =
  vi.fn<(token: string, action: string, ip: string | undefined) => Promise<RecaptchaAssessment>>()
const mockHasCredentials = vi.fn<() => boolean>()
const mockIsLockedOut = vi.fn<() => Promise<boolean>>()
const mockSetLockoutBackground = vi.fn<() => void>()
class TestRecaptchaRateLimitError extends Error {
  override name = 'RecaptchaRateLimitError'
}
const dependencies = {
  getRecaptchaConfig: mockGetRecaptchaConfig,
  fetchRecaptchaAssessment: mockFetchAssessment,
  hasRecaptchaCredentials: mockHasCredentials,
  isRecaptchaLockedOut: mockIsLockedOut,
  recaptchaRateLimitError: TestRecaptchaRateLimitError,
  setRecaptchaLockedOutBackground: mockSetLockoutBackground,
}

const NORMAL_USER = { id: 'user-1', roles: [] } as unknown as PrivateUser
const ADMIN_USER = { id: 'admin-1', roles: ['administrator'] } as unknown as PrivateUser
const TOKEN = 'client-recaptcha-token'
const IP = '203.0.113.7'

function config(overrides: Partial<RecaptchaConfig> = {}): RecaptchaConfig {
  return { enabled: true, blocking_enabled: false, block_threshold: 0.5, ...overrides }
}

function assessment(overrides: Partial<RecaptchaAssessment> = {}): RecaptchaAssessment {
  return { valid: true, action: 'create_post', score: 0.9, reasons: [], ...overrides }
}

let originalNodeEnv: string | undefined

describe('assessRecaptchaToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    mockGetRecaptchaConfig.mockReturnValue(config())
    mockHasCredentials.mockReturnValue(true)
    mockIsLockedOut.mockResolvedValue(false)
    mockFetchAssessment.mockResolvedValue(assessment())
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  function call(overrides: Partial<Parameters<typeof assessRecaptchaToken>[0]> = {}) {
    return assessRecaptchaToken({
      currentUser: NORMAL_USER,
      token: TOKEN,
      expectedAction: 'create_post',
      ip: IP,
      dependencies,
      ...overrides,
    })
  }

  describe('assessRecaptchaToken — skip paths (no assessment)', () => {
    it('skips when disabled', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ enabled: false }))
      await call()
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips outside production (dev/test never call the paid API)', async () => {
      process.env.NODE_ENV = 'test'
      await call()
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips when credentials are missing', async () => {
      mockHasCredentials.mockReturnValue(false)
      await call()
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips high-trust (admin) users', async () => {
      await call({ currentUser: ADMIN_USER })
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips when no token was supplied', async () => {
      await call({ token: undefined })
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips when the daily lockout is in effect', async () => {
      mockIsLockedOut.mockResolvedValue(true)
      await call()
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })
  })

  describe('assessRecaptchaToken — fail-open error handling', () => {
    it('engages the daily lockout and fails open on HTTP 429', async () => {
      mockFetchAssessment.mockRejectedValue(new TestRecaptchaRateLimitError('429'))
      await expect(call()).resolves.toBeUndefined()
      expect(mockSetLockoutBackground).toHaveBeenCalledOnce()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('fails open and logs on a generic error without locking out', async () => {
      mockFetchAssessment.mockRejectedValue(new Error('network down'))
      await expect(call()).resolves.toBeUndefined()
      expect(mockSetLockoutBackground).not.toHaveBeenCalled()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('wraps a non-Error rejection before logging', async () => {
      mockFetchAssessment.mockRejectedValue('boom')
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).toHaveBeenCalledOnce()
      expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error)
    })
  })

  describe('assessRecaptchaToken — scoring', () => {
    it('forwards token, expected action, and ip to the assessment', async () => {
      await call({ expectedAction: 'create_comment' })
      expect(mockFetchAssessment).toHaveBeenCalledWith(TOKEN, 'create_comment', IP)
    })

    it('passes silently for a high score', async () => {
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.9 }))
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).not.toHaveBeenCalled()
    })

    it('logs and fails open when the token is invalid (blocking on)', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ blocking_enabled: true }))
      mockFetchAssessment.mockResolvedValue(assessment({ valid: false, score: 0.9 }))
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('logs and fails open when the score is missing (blocking on)', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ blocking_enabled: true }))
      mockFetchAssessment.mockResolvedValue(assessment({ valid: true, score: null }))
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('logs but does not block a low score in monitor mode', async () => {
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.1 }))
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('blocks a low score with a generic error when blocking is enabled', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ blocking_enabled: true }))
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.1 }))
      await expect(call()).rejects.toMatchObject({ status: 400, message: RECAPTCHA_BLOCK_MESSAGE })
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('records an action mismatch in the Sentry extra', async () => {
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.1, action: 'create_comment' }))
      await call({ expectedAction: 'create_post' })
      const reported = captureException.mock.calls[0][0] as Error & {
        extra?: Record<string, unknown>
      }
      expect(reported.extra?.action_mismatch).toBe(true)
    })

    it('records no mismatch when the returned action is null', async () => {
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.1, action: null }))
      await call()
      const reported = captureException.mock.calls[0][0] as Error & {
        extra?: Record<string, unknown>
      }
      expect(reported.extra?.action_mismatch).toBe(false)
    })
  })
})
