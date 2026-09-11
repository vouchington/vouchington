// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/test-helpers can use this type without creating a
// test-helpers -> services workspace cycle. Re-exported here for call-site stability.
export type { UserWarning } from '@voucha/types/entities/user-warning'

export const USER_WARNING_REASON_MAX_LENGTH = 1000
export const USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH = 2000
