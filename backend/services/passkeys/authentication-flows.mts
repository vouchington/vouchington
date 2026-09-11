import createHttpError from 'http-errors'
import { AuthError } from '@vouchington/auth'
import { getPasskeyByCredentialId } from './get.mts'
import { toPasskeyAuthenticationOptions } from './options.mts'
import { passkeyProtocol } from './protocol.mts'

export async function getPasskeyAuthenticationOptions(userId: string, deviceId: string) {
  try {
    return toPasskeyAuthenticationOptions(
      await passkeyProtocol.authentication.createOptions(userId, deviceId),
    )
  } catch (error) {
    if (error instanceof AuthError && error.code === 'invalid_request') {
      throw createHttpError(400, 'No passkeys registered for this user')
    }
    throw error
  }
}

export async function verifyPasskeyAuthentication(
  userId: string,
  deviceId: string,
  expectedOrigin: string,
  response: unknown,
): Promise<{ verified: boolean; passkeyId: string }> {
  try {
    const result = await passkeyProtocol.authentication.verify({
      userId,
      deviceId,
      expectedOrigin,
      response,
    })
    return { verified: true, passkeyId: result.passkeyId }
  } catch (error) {
    if (!(error instanceof AuthError)) throw error
    if (error.code === 'challenge_expired') {
      throw createHttpError(400, 'Authentication challenge expired or not found')
    }
    if (error.code !== 'invalid_credentials') throw error
  }

  const responseObj = response as { id?: string }
  if (!responseObj.id) throw createHttpError(400, 'Invalid authentication response')

  const passkey = await getPasskeyByCredentialId(responseObj.id)
  if (!passkey || passkey.userId !== userId) {
    throw createHttpError(400, 'Passkey not found')
  }
  return { verified: false, passkeyId: passkey.id }
}
