import { describe, expect, it } from 'vitest'
import createHttpError from 'http-errors'
import {
  getBlueskyCallbackErrorCode,
  reportBlueskyCallbackError,
} from '../auth-bluesky-callback-helpers.mts'
import { sentryCaptureExceptionMock } from '../../../../test-helpers/vitest.setup.sentry-mock.mts'

describe('Bluesky callback failure reporting', () => {
  it('maps expected callback statuses to browser-safe codes', () => {
    expect(getBlueskyCallbackErrorCode(createHttpError(400))).toBe('invalid_request')
    expect(getBlueskyCallbackErrorCode(createHttpError(401))).toBe('not_logged_in')
    expect(getBlueskyCallbackErrorCode(createHttpError(403))).toBe('session_mismatch')
    expect(getBlueskyCallbackErrorCode(createHttpError(409))).toBe('already_linked')
  })

  it('reports unexpected failures with the mode and flow context', () => {
    const error = new Error('provider failed')
    reportBlueskyCallbackError(error, { mode: 'native', flowId: 'flow-1' })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'provider failed' }),
      expect.objectContaining({ tags: expect.objectContaining({ mode: 'native' }) }),
    )
  })
})
