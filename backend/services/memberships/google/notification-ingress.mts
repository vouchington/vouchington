import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { verifyGooglePubSubOidcJwt } from './oidc-verifier.mts'
import { parseGooglePlayRtdn } from './rtdn.mts'
import type { GoogleOidcTrustMaterial, GooglePlayMembershipProviderEnvironment } from './types.mts'

export class InvalidGooglePlayRtdnError extends Error {
  constructor() {
    super('Invalid Google Play notification.')
    this.name = 'InvalidGooglePlayRtdnError'
  }
}
export class GooglePlayRtdnTrustUnavailableError extends Error {
  constructor() {
    super('Google Play notification trust keys are unavailable.')
    this.name = 'GooglePlayRtdnTrustUnavailableError'
  }
}

/** Request-path ingress: local OIDC verification and durable write only; no JWKS or Play calls. */
export async function ingestGooglePlayRtdnPush(options: {
  rawBody: Buffer
  authorization: string | undefined
  environment: GooglePlayMembershipProviderEnvironment
  applicationId: string
  trust: GoogleOidcTrustMaterial | null
  enqueue: (job: {
    evidenceId: string
    purchaseToken: string
    environment: GooglePlayMembershipProviderEnvironment
  }) => Promise<void>
}): Promise<{ evidenceId: string; replayed: boolean }> {
  const token = options.authorization?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!options.trust) throw new GooglePlayRtdnTrustUnavailableError()
  const oidc = token ? verifyGooglePubSubOidcJwt(token, options.trust) : 'invalid'
  if (oidc === 'key_unavailable') throw new GooglePlayRtdnTrustUnavailableError()
  if (oidc !== 'valid') throw new InvalidGooglePlayRtdnError()
  const rtdn = parseGooglePlayRtdn(options.rawBody, options.applicationId)
  if (!rtdn) throw new InvalidGooglePlayRtdnError()
  if ('kind' in rtdn && rtdn.kind === 'ignored')
    return { evidenceId: rtdn.messageId, replayed: true }
  const lookup = createHash('sha256')
    .update(
      `google-play:rtdn:${options.environment}:${options.applicationId}:${JSON.stringify(rtdn)}`,
    )
    .digest('hex')
  await using query = await beginTransaction()
  const encrypted = Buffer.from(
    encryptSecret(
      options.rawBody.toString('utf8'),
      `membership-provider-evidence:google_play:${lookup}`,
    ),
  )
  const { rows: inserted } = await query<{
    id: string
  }>(sql`/* ingestGooglePlayRtdnPush.insertEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, provider_event_id,
      evidence_lookup_sha256, encrypted_evidence
    ) VALUES ('google_play', ${options.environment}, ${options.applicationId}, ${rtdn.messageId}, ${lookup}, ${encrypted})
    ON CONFLICT (provider, environment, application_id, provider_event_id) WHERE provider_event_id IS NOT NULL
      DO NOTHING RETURNING id`)
  const evidenceId =
    inserted[0]?.id ??
    (
      await query<{ id: string }>(sql`/* ingestGooglePlayRtdnPush.existingEvidence */
    SELECT id FROM membership_provider_evidence_records
    WHERE provider = 'google_play' AND environment = ${options.environment} AND application_id = ${options.applicationId}
      AND provider_event_id = ${rtdn.messageId} AND evidence_lookup_sha256 = ${lookup}
    FOR KEY SHARE`)
    ).rows[0]?.id
  if (!evidenceId) throw new InvalidGooglePlayRtdnError()
  await query.commit()
  await options.enqueue({
    evidenceId,
    purchaseToken: rtdn.purchaseToken,
    environment: options.environment,
  })
  return { evidenceId, replayed: inserted.length === 0 }
}
