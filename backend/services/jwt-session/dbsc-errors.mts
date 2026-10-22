import { SESSION_RELOGIN_REQUIRED } from '@modules/on-error/error-codes'
import { createCodedError } from '@modules/on-error/create-coded-error'

export function sessionAuthorityRequired(): Error {
  return createCodedError(401, 'Session authority unavailable', SESSION_RELOGIN_REQUIRED)
}
