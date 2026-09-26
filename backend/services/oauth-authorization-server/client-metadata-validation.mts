import { invalidClientMetadata } from './errors.mts'
import type { OAuthClientAuthMethod, RegisterOAuthClientInput } from './types.mts'

// RFC 7591 client-metadata validators shared by dynamic registration and owner-managed apps.

export function validateClientName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 120 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  ) {
    throw invalidClientMetadata('client_name must contain between 1 and 120 characters')
  }
  return value.trim()
}

export function validateAuthMethod(value: unknown): OAuthClientAuthMethod {
  if (value === undefined || value === 'none') return 'none'
  if (value === 'client_secret_basic') return value
  throw invalidClientMetadata('token_endpoint_auth_method is not supported')
}

export function validateGrantTypes(value: unknown): Array<'authorization_code' | 'refresh_token'> {
  const grantTypes = value ?? ['authorization_code', 'refresh_token']
  if (!Array.isArray(grantTypes) || grantTypes.length === 0) {
    throw invalidClientMetadata('grant_types is invalid')
  }
  const unique = new Set(grantTypes)
  if (
    unique.size !== grantTypes.length ||
    !unique.has('authorization_code') ||
    !unique.has('refresh_token') ||
    [...unique].some(type => type !== 'authorization_code' && type !== 'refresh_token')
  ) {
    throw invalidClientMetadata('grant_types is not supported')
  }
  return [...unique].sort() as Array<'authorization_code' | 'refresh_token'>
}

export function validateResponseTypes(value: unknown): ['code'] {
  const responseTypes = value ?? ['code']
  if (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== 'code') {
    throw invalidClientMetadata('only the code response type is supported')
  }
  return ['code']
}

export function validateRegistrationObject(input: unknown): RegisterOAuthClientInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidClientMetadata('registration metadata must be a JSON object')
  }
  return input as RegisterOAuthClientInput
}
