import { describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanResolveModerationReport } from './authorization.mts'

describe('currentUserCanResolveModerationReport', () => {
  it('allows administrators and moderators', () => {
    expect(currentUserCanResolveModerationReport(makeUser(['administrator']))).toBe(true)
    expect(currentUserCanResolveModerationReport(makeUser(['moderator']))).toBe(true)
  })

  it('rejects regular, anonymous, and missing-role viewers', () => {
    expect(currentUserCanResolveModerationReport(makeUser([]))).toBe(false)
    expect(currentUserCanResolveModerationReport(makeUser(['member']))).toBe(false)
    expect(currentUserCanResolveModerationReport(null)).toBe(false)
  })
})

function makeUser(roles: string[]): PrivateUser {
  return { roles } as unknown as PrivateUser
}
