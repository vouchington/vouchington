import createHttpError from 'http-errors'
import { AuthError } from '@vouchington/auth'
import { passkeyProtocol } from './protocol.mts'
import { toPasskeyRegistrationOptions } from './options.mts'
import type { PublicPasskey } from './types.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

type PasskeyUser = Pick<PrivateUser, 'id' | 'username'>

export async function getPasskeyRegistrationOptions(currentUser: PasskeyUser, deviceId: string) {
  const name = currentUser.username ?? currentUser.id
  const options = await passkeyProtocol.registration.createOptions(
    {
      id: currentUser.id,
      webAuthnUserId: Buffer.from(currentUser.id),
      name,
      displayName: name,
    },
    deviceId,
  )
  return toPasskeyRegistrationOptions(options)
}

export async function verifyPasskeyRegistration(
  currentUserId: string,
  deviceId: string,
  expectedOrigin: string,
  response: unknown,
  name?: string,
): Promise<PublicPasskey> {
  const passkeyName = getPasskeyName(name)
  try {
    return await passkeyProtocol.registration.verify({
      userId: currentUserId,
      deviceId,
      expectedOrigin,
      response,
      context: passkeyName,
    })
  } catch (error) {
    if (error instanceof AuthError && error.code === 'challenge_expired') {
      throw createHttpError(400, 'Registration challenge expired or not found')
    }
    if (error instanceof AuthError && error.code === 'invalid_credentials') {
      throw createHttpError(400, 'Registration verification failed')
    }
    throw error
  }
}

function getPasskeyName(name?: string): string {
  const value = (name ?? 'My Passkey').trim()
  if (value.length === 0 || value.length > 100) {
    throw createHttpError(422, 'name must be 1–100 characters')
  }
  return value
}
