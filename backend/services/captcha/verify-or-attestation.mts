import type { Context } from '@jongleberry/api-server'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { BYPASS_DISABLED } from '@modules/on-error/error-codes'
import {
  isAppAttestationEnabled,
  isAttestationRequiredForBypass,
  verifyAssertion,
} from '@services/app-attestation'
import { extractTurnstileTokenFromBody, verifyCaptchaToken } from './verify.mts'

export type VerifyCaptchaOrAttestationOptions = {
  actionTag: string
  fieldNames?: readonly string[]
}

function headerValueToString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

export async function verifyCaptchaOrAttestation(
  ctx: Context,
  body: unknown,
  opts: VerifyCaptchaOrAttestationOptions,
): Promise<void> {
  // Per-request signing already verified — skip challenge-path only when App Attest bypass is active.
  if (
    ctx.hasVerifiedRequestSignature() &&
    isAppAttestationEnabled() &&
    isAttestationRequiredForBypass()
  )
    return

  const keyId = headerValueToString(ctx.req.headers['x-app-attest-key-id'])
  const assertion = headerValueToString(ctx.req.headers['x-app-attest-assertion'])
  const challengeId = headerValueToString(ctx.req.headers['x-app-attest-challenge-id'])

  if (keyId && assertion && challengeId) {
    if (!isAppAttestationEnabled() || !isAttestationRequiredForBypass()) {
      throw createCodedError(403, 'App Attest bypass is not enabled', BYPASS_DISABLED)
    }

    const { did } = await ctx.getDeviceTokenData()
    await verifyAssertion({
      challengeKey: challengeId,
      keyId,
      did,
      assertion: Buffer.from(assertion, 'base64'),
      payload: `${challengeId}:${opts.actionTag}`,
    })
    return
  }

  await verifyCaptchaToken(extractTurnstileTokenFromBody(body, opts.fieldNames), ctx.ip)
}
