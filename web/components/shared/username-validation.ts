import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isUsernameUUID,
} from '@ts-shared/utils/validation-core'

export function canCheckUsernameAvailability(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    /^[a-z][a-z0-9_-]+[a-z0-9]$/i.test(value) &&
    (value.match(/[a-z]/gi)?.length ?? 0) >= 3 &&
    !isUsernameUUID(value)
  )
}
