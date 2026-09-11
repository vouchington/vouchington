import { createPublicKey } from 'node:crypto'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { verifyAttestation } from 'node-app-attest'
import { getAndDeleteAppAttestChallenge } from './challenges.mts'
import {
  getAppleAppAttestBundleId,
  getAppleAppAttestTeamId,
  isDevelopmentAttestationAllowed,
} from './config.mts'
import { insertAttestationKey } from './store.mts'
import type { AppAttestEnvironment, AttestationResult } from './types.mts'

export type VerifyAndStoreAttestationParams = {
  challengeKey: string
  keyId: string
  did: string
  attestation: Buffer
}

export async function verifyAndStoreAttestation(
  params: VerifyAndStoreAttestationParams,
): Promise<AttestationResult> {
  const challenge = await getAndDeleteAppAttestChallenge('attestation', params.challengeKey)
  assert(challenge, 400, 'App Attest challenge missing or expired')

  const bundleIdentifier = getAppleAppAttestBundleId()

  let result
  try {
    result = verifyAttestation({
      attestation: params.attestation,
      challenge,
      keyId: params.keyId,
      bundleIdentifier,
      teamIdentifier: getAppleAppAttestTeamId(),
      allowDevelopmentEnvironment: isDevelopmentAttestationAllowed(),
    })
  } catch (err) {
    throw createHttpError(401, 'App Attest attestation verification failed', { cause: err })
  }

  const publicKeyDer = createPublicKey(result.publicKey).export({
    type: 'spki',
    format: 'der',
  })

  const environment = asAppAttestEnvironment(result.environment)

  await insertAttestationKey({
    keyId: Buffer.from(result.keyId, 'base64'),
    did: params.did,
    publicKey: publicKeyDer,
    bundleId: bundleIdentifier,
    environment,
  })

  return { keyId: result.keyId, environment }
}

function asAppAttestEnvironment(environment: string): AppAttestEnvironment {
  assert(
    environment === 'production' || environment === 'development',
    500,
    'Unexpected App Attest environment',
  )
  return environment
}
