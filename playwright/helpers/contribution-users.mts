import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../backend/test-helpers/index.mts'

export function createEligibleTestUser(username: string) {
  return createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { username })
}
