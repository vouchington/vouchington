import { randomBytes } from 'node:crypto'

export const LOGIN_TOKEN_LENGTH = 8
export const LOGIN_TOKEN_PATTERN = new RegExp(`^[0-9A-F]{${LOGIN_TOKEN_LENGTH}}$`)
const LOGIN_TOKEN_BYTES = LOGIN_TOKEN_LENGTH / 2

if (!Number.isInteger(LOGIN_TOKEN_BYTES)) {
  throw new Error('Login token length must be an even number of hex characters')
}

export function createLoginToken(createRandomBytes: typeof randomBytes = randomBytes) {
  return createRandomBytes(LOGIN_TOKEN_BYTES).toString('hex').toUpperCase()
}

export function assertValidLoginToken(token: string): void {
  if (!LOGIN_TOKEN_PATTERN.test(token)) {
    throw new Error(`Login token must be ${LOGIN_TOKEN_LENGTH} uppercase hex characters`)
  }
}
