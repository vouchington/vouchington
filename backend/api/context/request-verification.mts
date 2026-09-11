import type { Application, Context } from '@jongleberry/api-server'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ATTESTATION_SIGNATURE_REQUIRED } from '@modules/on-error/error-codes'
import onError from '@modules/on-error'
import {
  getRequestSigningMode,
  verifyRequestSignature,
  ATTESTED_BODY_LIMIT,
} from '@services/app-attestation'

declare module '@jongleberry/api-server' {
  interface Context {
    verifyAttestedRequestSignature(): Promise<void>
    hasVerifiedRequestSignature(): boolean
    reqSigRan?: boolean
    reqSigVerified?: boolean
    reqSigPromise?: Promise<void>
  }
}

function headerToString(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.length > 0) return value[0]!
  return ''
}

async function runVerification(ctx: Context): Promise<void> {
  const mode = getRequestSigningMode()
  ctx.reqSigRan = true

  if (mode === 'off') return

  // Only attested devices carry per-request signatures; unattested devices (web, unauthenticated
  // native, .NET) pass through silently regardless of mode.
  const deviceData = await ctx.getDeviceTokenData()
  const dc = 'dc' in deviceData ? deviceData.dc : undefined
  if (dc !== 'attested') return

  const keyId = headerToString(ctx.req.headers['x-app-attest-key-id'])
  const assertion = headerToString(ctx.req.headers['x-app-attest-assertion'])
  const timestamp = headerToString(ctx.req.headers['x-app-attest-timestamp'])
  const nonce = headerToString(ctx.req.headers['x-app-attest-nonce'])

  if (!keyId || !assertion || !timestamp || !nonce) {
    if (mode === 'enforce') {
      throw createCodedError(
        403,
        'App Attest request signature required',
        ATTESTATION_SIGNATURE_REQUIRED,
      )
    }
    onError(new Error('App Attest request signature missing in observe mode'))
    return
  }

  const did = deviceData.did
  const rawPath = ctx.req.url ?? '/'
  const path = rawPath.split('?')[0]!
  const method = ctx.req.method?.toUpperCase() ?? 'GET'

  try {
    const body = (await ctx.request.buffer(ATTESTED_BODY_LIMIT)) ?? Buffer.alloc(0)
    await verifyRequestSignature({ method, path, body, keyId, assertion, timestamp, nonce, did })
    ctx.reqSigVerified = true
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    if (mode === 'enforce') throw err
  }
}

const extensions = {
  async verifyAttestedRequestSignature(this: Context): Promise<void> {
    if (this.reqSigRan) return
    if (this.reqSigPromise) return this.reqSigPromise

    this.reqSigPromise = runVerification(this)
    try {
      return await this.reqSigPromise
    } finally {
      this.reqSigPromise = undefined
    }
  },

  hasVerifiedRequestSignature(this: Context): boolean {
    return this.reqSigVerified === true
  },
}

export default function applyRequestVerificationContext(app: Application): void {
  app.extend(extensions)
}
