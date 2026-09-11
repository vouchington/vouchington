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

export const validateUUID = (uuid: string) => {
  assert(isUUID(uuid), 422, 'Invalid UUID')
  return uuid
}
