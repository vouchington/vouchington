import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import type { PrivateUser } from '@services/users/types'
import type { RecaptchaConfig } from './config.mts'
import type { RecaptchaAssessmentResult } from '@vouchington/utils/recaptcha-enterprise'
import type { RecaptchaCredentials } from './fetch-assessment.mts'
import { assessRecaptchaToken } from './assess.mts'

const captureException = sentryCaptureExceptionMock

const mockGetRecaptchaConfig = vi.fn<() => RecaptchaConfig>()
const mockFetchAssessment =
  vi.fn<
    (
      credentials: RecaptchaCredentials,
      token: string,
      action: string,
      ip: string | undefined,
    ) => Promise<RecaptchaAssessmentResult>
  >()
const mockGetCredentials = vi.fn<() => RecaptchaCredentials | undefined>()
const mockIsLockedOut = vi.fn<() => Promise<boolean>>()
const mockSetLockoutBackground = vi.fn<() => void>()
const dependencies = {
  getRecaptchaConfig: mockGetRecaptchaConfig,
  fetchRecaptchaAssessment: mockFetchAssessment,
  getRecaptchaCredentials: mockGetCredentials,
  isRecaptchaLockedOut: mockIsLockedOut,
  setRecaptchaLockedOutBackground: mockSetLockoutBackground,
}

const CREDENTIALS = { projectId: 'proj-123', apiKey: 'api-key', siteKey: 'site-key' }

const NORMAL_USER = { id: 'user-1', roles: [] } as unknown as PrivateUser
const ADMIN_USER = { id: 'admin-1', roles: ['administrator'] } as unknown as PrivateUser
const TOKEN = 'client-recaptcha-token'
const IP = '203.0.113.7'

function config(overrides: Partial<RecaptchaConfig> = {}): RecaptchaConfig {
  return { enabled: true, blocking_enabled: false, block_threshold: 0.5, ...overrides }
}

function assessment(
  overrides: { score?: number; action?: string | null } = {},
): RecaptchaAssessmentResult {
  const action = overrides.action === undefined ? 'create_post' : overrides.action
  return {
    status: 'assessed',
    score: overrides.score ?? 0.9,
    action,
    actionMatches: action === 'create_post',
    reasons: [],
  }
}

function providerError(
  kind: 'rate-limited' | 'transport' | 'malformed-response',
): RecaptchaAssessmentResult {
  return {
    status: 'error',
    failure: {
      kind,
      retryable: kind !== 'malformed-response',
      message: `reCAPTCHA Enterprise assessment ${kind}`,
      status: kind === 'rate-limited' ? 429 : null,
      retryAfterMs: null,
      cause: null,
    },
  }
}

describe('assessRecaptchaToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    mockGetRecaptchaConfig.mockReturnValue(config())
    mockGetCredentials.mockReturnValue(CREDENTIALS)
    mockIsLockedOut.mockResolvedValue(false)
    mockFetchAssessment.mockResolvedValue(assessment())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
      vi.stubEnv('ENVIRONMENT', 'test')
      await call()
      expect(mockFetchAssessment).not.toHaveBeenCalled()
    })

    it('skips when credentials are missing', async () => {
      mockGetCredentials.mockReturnValue(undefined)
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
    it('engages the daily lockout and fails open when rate limited', async () => {
      mockFetchAssessment.mockResolvedValue(providerError('rate-limited'))
      await expect(call()).resolves.toBeUndefined()
      expect(mockSetLockoutBackground).toHaveBeenCalledOnce()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('fails open and logs on a transport error without locking out', async () => {
      mockFetchAssessment.mockResolvedValue(providerError('transport'))
      await expect(call()).resolves.toBeUndefined()
      expect(mockSetLockoutBackground).not.toHaveBeenCalled()
      expect(captureException).toHaveBeenCalledOnce()
    })
  })

  describe('assessRecaptchaToken — scoring', () => {
    it('forwards token, expected action, and ip to the assessment', async () => {
      await call({ expectedAction: 'create_comment' })
      expect(mockFetchAssessment).toHaveBeenCalledWith(CREDENTIALS, TOKEN, 'create_comment', IP)
    })

    it('passes silently for a high score', async () => {
      mockFetchAssessment.mockResolvedValue(assessment({ score: 0.9 }))
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).not.toHaveBeenCalled()
    })

    it('logs and fails open when the token is invalid (blocking on)', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ blocking_enabled: true }))
      mockFetchAssessment.mockResolvedValue({
        status: 'invalid-token',
        invalidReason: 'EXPIRED',
        action: 'create_post',
      })
      await expect(call()).resolves.toBeUndefined()
      expect(captureException).toHaveBeenCalledOnce()
    })

    it('logs and fails open without locking out when the score is missing (blocking on)', async () => {
      mockGetRecaptchaConfig.mockReturnValue(config({ blocking_enabled: true }))
      mockFetchAssessment.mockResolvedValue(providerError('malformed-response'))
      await expect(call()).resolves.toBeUndefined()
      expect(mockSetLockoutBackground).not.toHaveBeenCalled()
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
      await expect(call()).rejects.toMatchObject({
        status: 400,
        message: 'Unable to submit your request right now. Please try again.',
      })
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
