import assert from 'http-assert'
import createHttpError from 'http-errors'
import { describe, expect, it, vi } from 'vitest'
import Sentry from '@modules/on-error/sentry'
import {
  getDsaStatementBuildFailureCode,
  reportDsaStatementBuildFailure,
} from './dsa-statement-submission-build-failure.mts'

describe('payload build failure classification', () => {
  it('classifies the payload builder asserts by their status only', () => {
    const thrownBy = (operation: () => void): unknown => {
      try {
        operation()
      } catch (err) {
        return err
      }
      throw new Error('Expected the operation to throw')
    }

    expect(
      getDsaStatementBuildFailureCode(thrownBy(() => assert(false, 404, 'Restriction not found'))),
    ).toBe('http_404')
    expect(
      getDsaStatementBuildFailureCode(thrownBy(() => assert(false, 422, 'No upload date'))),
    ).toBe('http_422')
    expect(getDsaStatementBuildFailureCode(createHttpError(500, 'Unsupported'))).toBe('http_500')
  })

  it('leaves database and programming errors for the sweep to rethrow', () => {
    const databaseError = Object.assign(new Error('canceling statement due to timeout'), {
      code: '57014',
    })

    expect(getDsaStatementBuildFailureCode(databaseError)).toBeNull()
    expect(getDsaStatementBuildFailureCode(new TypeError('x is undefined'))).toBeNull()
    expect(getDsaStatementBuildFailureCode(new Error('Unexpected builder failure'))).toBeNull()
    expect(getDsaStatementBuildFailureCode('http_404')).toBeNull()
    expect(getDsaStatementBuildFailureCode(undefined)).toBeNull()
  })

  it('warns once with the restriction id and code, never a message or payload', () => {
    const captureMessage = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const restrictionId = '0199a000-0000-7000-8000-000000000001'

    reportDsaStatementBuildFailure({
      restrictionId,
      failureCode: 'http_404',
      payload: { puid: 'ignored' },
      message: 'ignored',
    } as Parameters<typeof reportDsaStatementBuildFailure>[0])

    expect(captureMessage).toHaveBeenCalledExactlyOnceWith(
      'copyright_dsa_statement_payload_build_failed',
      {
        level: 'warning',
        tags: {
          reason: 'copyright_dsa_statement_payload_build_failed',
          restrictionId,
          failureCode: 'http_404',
        },
      },
    )
    captureMessage.mockRestore()
  })
})
