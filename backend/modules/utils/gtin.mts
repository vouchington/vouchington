import assert from 'http-assert'
import { isValidGTINFormat, isValidGTINCheckDigit } from '@ts-shared/utils/gtin'

export function assertValidGTIN(gtin: string): void {
  assert(isValidGTINFormat(gtin), 422, 'GTIN must be 8, 12, 13, or 14 digits')
  assert(isValidGTINCheckDigit(gtin), 422, 'GTIN has invalid check digit')
}
