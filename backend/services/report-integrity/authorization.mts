import type { PrivateUser } from '@services/users/types'

export function currentUserCanReviewReportIntegrityFlags(currentUser: PrivateUser): boolean {
  return currentUser.roles.includes('administrator')
}

export function currentUserCanApplyReportAbusePenalty(currentUser: PrivateUser): boolean {
  return currentUser.roles.includes('administrator')
}
