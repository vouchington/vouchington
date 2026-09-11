export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 50

/** Minimum character count for review markdown body. */
export const REVIEW_MIN_CHARACTERS = 150
/** Minimum word count for review markdown body. */
export const REVIEW_MIN_WORDS = 30
/** Minimum sentence count for review markdown body. */
export const REVIEW_MIN_SENTENCES = 3

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export {
  isEmailAddress,
  isUuid as isUsernameUUID,
  isUuid as isUUID,
} from '@vouchington/utils/validation'
