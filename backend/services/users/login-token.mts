import { randomBytes } from 'node:crypto'
import {
  LOGIN_CODE_ALPHABET,
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_PATTERN,
} from '@ts-shared/utils/login-code'

export const LOGIN_TOKEN_LENGTH = LOGIN_CODE_LENGTH
export const LOGIN_TOKEN_PATTERN = LOGIN_CODE_PATTERN

export function createLoginToken(createRandomBytes: typeof randomBytes = randomBytes) {
  // Each byte contributes five independent random bits, without modulo bias.
  return Array.from(
    createRandomBytes(LOGIN_TOKEN_LENGTH),
    byte => LOGIN_CODE_ALPHABET[byte & 31],
  ).join('')
}

export function assertValidLoginToken(token: string): void {
  if (!LOGIN_TOKEN_PATTERN.test(token)) {
    throw new Error(`Login token must be ${LOGIN_TOKEN_LENGTH} uppercase base32 characters`)
  }
}
