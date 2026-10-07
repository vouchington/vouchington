import assert from 'http-assert'
import { isUUID } from '@ts-shared/utils/validation-core'
import {
  getDateFromUuidv7,
  getMaxUuidv7ForDate,
  getMinUuidv7ForDate,
  mintUuidv7,
  uuidv7RandomToBase36,
} from '@vouchington/uuid-v7'

export { isUUID }

export const mintUUIDv7 = mintUuidv7
export const getDateFromUUIDv7 = getDateFromUuidv7
export const convertUUIDToBase36 = uuidv7RandomToBase36
export const getMinUUIDv7ForDate = getMinUuidv7ForDate
export const getMaxUUIDv7ForDate = getMaxUuidv7ForDate

/** Earliest possible history ID for a UUIDv7 parent, including the one-hour creation skew. */
export function getMinUUIDv7ForParentHistory(parentId: string): string {
  const createdAt = getDateFromUuidv7(parentId)
  // A non-v7 parent cannot provide a safe time bound; retain the complete history scan.
  if (!createdAt) return '00000000-0000-0000-0000-000000000000'
  return getMinUUIDv7ForDate(new Date(Math.max(0, createdAt.getTime() - 60 * 60 * 1000)))
}

export const validateUUID = (uuid: string) => {
  assert(isUUID(uuid), 422, 'Invalid UUID')
  return uuid
}
