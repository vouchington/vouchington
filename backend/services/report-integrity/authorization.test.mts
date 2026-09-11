import { describe, it, expect } from 'vitest'
import {
  currentUserCanReviewReportIntegrityFlags,
  currentUserCanApplyReportAbusePenalty,
} from './authorization.mts'
import type { PrivateUser } from '@services/users/types'

describe('report-integrity authorization', () => {
  function makeUser(roles: string[]): PrivateUser {
    return { roles } as unknown as PrivateUser
  }

  describe('currentUserCanReviewReportIntegrityFlags', () => {
    it('returns true for administrator', () => {
      expect(currentUserCanReviewReportIntegrityFlags(makeUser(['administrator']))).toBe(true)
    })

    it('returns false for a user with no roles', () => {
      expect(currentUserCanReviewReportIntegrityFlags(makeUser([]))).toBe(false)
    })

    it.each(['moderator', 'customer_support', 'user'])('returns false for the %s role', role => {
      expect(currentUserCanReviewReportIntegrityFlags(makeUser([role]))).toBe(false)
    })
  })

  describe('currentUserCanApplyReportAbusePenalty', () => {
    it('returns true for administrator', () => {
      expect(currentUserCanApplyReportAbusePenalty(makeUser(['administrator']))).toBe(true)
    })

    it('returns false for a user with no roles', () => {
      expect(currentUserCanApplyReportAbusePenalty(makeUser([]))).toBe(false)
    })

    it.each(['moderator', 'customer_support', 'user'])('returns false for the %s role', role => {
      expect(currentUserCanApplyReportAbusePenalty(makeUser([role]))).toBe(false)
    })
  })
})
