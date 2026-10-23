import { buildIdentityVerificationParams, parseVerificationSession } from '@vouchington/stripe'
import { getStripeClient } from './client.mts'

export type VerificationResult =
  | {
      outcome: 'verified'
      firstName: string | null
      lastName: string | null
      fullName: string | null
      documentNumber: string
      issuingCountry: string
      documentType: string
    }
  | { outcome: 'requires_input' | 'canceled' | 'failed' }

export type CreatedVerificationSession = { sessionId: string; url: string }

export type IdentityVerificationProvider = {
  createVerificationSession: (options: {
    userId: string
    returnUrl: string
    checkoutSessionId: string
    idempotencyKey?: string
  }) => Promise<CreatedVerificationSession>
  getVerificationSessionUrl: (sessionId: string) => Promise<string | null>
  getVerificationResult: (sessionId: string) => Promise<VerificationResult>
}

export type StripeVerificationSessionResult = {
  status: string
  verified_outputs?: {
    first_name?: string | null
    last_name?: string | null
    id_number?: string | null
    id_number_type?: string | null
    address?: { country?: string | null } | null
  } | null
  last_verification_report?: {
    document?: {
      type?: string | null
      issuing_country?: string | null
      number?: { value?: string | null } | null
      first_name?: { value?: string | null } | null
      last_name?: { value?: string | null } | null
    } | null
  } | null
}

/* no-mistakes: integration=stripe */
export async function stripeCreateVerificationSession(
  userId: string,
  returnUrl: string,
  checkoutSessionId: string,
  idempotencyKey?: string,
): Promise<{ id: string; url: string | null }> {
  const stripe = getStripeClient()
  const session = await stripe.identity.verificationSessions.create(
    buildIdentityVerificationParams({
      type: 'document',
      metadata: { user_id: userId, checkout_session_id: checkoutSessionId },
      options: {
        document: {
          require_matching_selfie: true,
          require_live_capture: true,
        },
      },
      returnUrl,
    }),
    idempotencyKey ? { idempotencyKey } : undefined,
  )
  return { id: session.id, url: session.url ?? null }
}

/* no-mistakes: integration=stripe */
export async function stripeRetrieveVerificationSessionUrl(
  sessionId: string,
): Promise<string | null> {
  const stripe = getStripeClient()
  const session = await stripe.identity.verificationSessions.retrieve(sessionId)
  return session.url ?? null
}

/* no-mistakes: integration=stripe */
export async function stripeGetVerificationSession(
  sessionId: string,
): Promise<StripeVerificationSessionResult> {
  const stripe = getStripeClient()
  const session = await stripe.identity.verificationSessions.retrieve(sessionId, {
    expand: ['verified_outputs', 'last_verification_report.document'],
  })
  return session as unknown as StripeVerificationSessionResult
}

/* no-mistakes: integration=stripe */
export const stripeIdentityProvider: IdentityVerificationProvider = {
  async createVerificationSession({
    userId,
    returnUrl,
    checkoutSessionId,
    idempotencyKey,
  }): Promise<CreatedVerificationSession> {
    const result = await stripeCreateVerificationSession(
      userId,
      returnUrl,
      checkoutSessionId,
      idempotencyKey,
    )
    if (!result.url) throw new Error('Stripe Identity session missing URL')
    return { sessionId: result.id, url: result.url }
  },

  getVerificationSessionUrl(sessionId: string): Promise<string | null> {
    if (!sessionId) return Promise.resolve(null)
    return stripeRetrieveVerificationSessionUrl(sessionId)
  },

  async getVerificationResult(sessionId: string): Promise<VerificationResult> {
    const session = await stripeGetVerificationSession(sessionId)

    const document = session.last_verification_report?.document
    const outputs = session.verified_outputs
    // Voucha accepts the verified-output identity fields as fallback evidence and retains
    // its current nonterminal-result policy. The package owns document result parsing.
    const result = parseVerificationSession({
      status: session.status,
      verified_outputs: outputs,
      last_verification_report: {
        document: {
          first_name: document?.first_name?.value,
          last_name: document?.last_name?.value,
          number: outputs?.id_number ?? document?.number?.value,
          issuing_country: document?.issuing_country ?? outputs?.address?.country,
          type: document?.type ?? outputs?.id_number_type,
        },
      },
    })
    if (result.outcome === 'verified') return result
    return { outcome: result.outcome === 'processing' ? 'failed' : result.outcome }
  },
}
