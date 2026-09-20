import { describe, expect, it } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import {
  parseFormBody,
  parseOAuthClientAuthentication,
  parseOAuthRegistrationBody,
} from './protocol-helpers.mts'

function context(headers: Record<string, string | undefined>): Context {
  return { req: { headers } } as unknown as Context
}

describe('OAuth protocol helper failure boundaries', () => {
  it('requires form encoding for token and revocation payloads', async () => {
    await expect(
      parseFormBody(context({ 'content-type': 'application/json' })),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('requires JSON registration metadata before reading the request body', async () => {
    await expect(
      parseOAuthRegistrationBody(context({ 'content-type': 'application/x-www-form-urlencoded' })),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it.each([
    [
      'a Basic header mixed with body client credentials',
      'Basic Y2xpZW50OnNlY3JldA==',
      'client_id=client',
    ],
    ['a Basic credential without a client identifier', 'Basic OmFzZWNyZXQ=', ''],
    ['a Basic credential that decodes to invalid UTF-8', 'Basic /w==', ''],
    ['a malformed percent-encoded client identifier', 'Basic Y2xpZW50OiU=', ''],
  ])('rejects %s', (_name, authorization, form) => {
    expect(() =>
      parseOAuthClientAuthentication(context({ authorization }), new URLSearchParams(form)),
    ).toThrowError(expect.objectContaining({ code: 'invalid_client' }))
  })
})
