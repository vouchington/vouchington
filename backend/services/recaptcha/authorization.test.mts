import { describe, it, expect } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  isHighTrustUser,
  currentUserCanViewRecaptchaConfig,
  currentUserCanUpdateRecaptchaConfig,
} from './authorization.mts'

const ADMIN = { id: 'a', roles: ['administrator'] } as unknown as PrivateUser
const MEMBER = { id: 'm', roles: [] } as unknown as PrivateUser

describe('recaptcha authorization', () => {
  it.each([
    ['isHighTrustUser', isHighTrustUser],
    ['currentUserCanViewRecaptchaConfig', currentUserCanViewRecaptchaConfig],
    ['currentUserCanUpdateRecaptchaConfig', currentUserCanUpdateRecaptchaConfig],
  ])('%s is false for anonymous users', (_name, fn) => {
    expect(fn(null)).toBe(false)
  })

  it.each([
    ['isHighTrustUser', isHighTrustUser],
    ['currentUserCanViewRecaptchaConfig', currentUserCanViewRecaptchaConfig],
    ['currentUserCanUpdateRecaptchaConfig', currentUserCanUpdateRecaptchaConfig],
  ])('%s is true for administrators and false for members', (_name, fn) => {
    expect(fn(ADMIN)).toBe(true)
    expect(fn(MEMBER)).toBe(false)
  })
})
