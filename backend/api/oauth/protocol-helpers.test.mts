import { describe, expect, it } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import { parseFormBody, parseOAuthRegistrationBody } from './protocol-helpers.mts'

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
})
