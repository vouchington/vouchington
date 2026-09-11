import { normalizePhoneNumber } from '@vouchington/phone-validation'

export { isPhoneNumber } from '@vouchington/phone-validation'

function createInvalidPhoneNumberError(): Error & { status: number } {
  const error = new Error('Invalid phone number') as Error & { status: number }
  error.status = 422
  return error
}

export function verifyPhoneNumber(phoneNumber: string): string {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)
  if (normalizedPhoneNumber === null) {
    throw createInvalidPhoneNumberError()
  }
  return normalizedPhoneNumber
}
