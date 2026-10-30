import { timingSafeEqual } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightReplayKeyMetadata } from './replay-identity-hmac.mts'

/** Caller locks live notice then opaque group before this metadata/admission phase. */
export async function requireCopyrightReplayKeyVersions(query: TransactionQuery): Promise<void> {
  const configured = copyrightReplayKeyMetadata()
  await query(sql`/* serializeCopyrightReplayKeyVersions */
    SELECT pg_advisory_xact_lock(hashtextextended('copyright-replay-key-versions', 0))`)
  const { rows: omitted } = await query<{ id: string }>(sql`/* requireCopyrightReplayKeyCoverage */
    SELECT key_name AS id FROM copyright_replay_hmac_key_versions
    WHERE retained_identity_count > 0 AND NOT (key_name = ANY(${configured.map(key => key.id)}::text[])) LIMIT 1`)
  if (omitted.length)
    throw new Error('Dedicated copyright replay ring omits a required retained key version')
  await query(sql`/* registerCopyrightReplayKeyVersions */
    INSERT INTO copyright_replay_hmac_key_versions (key_name, material_verification_hmac)
    SELECT key_name, decode(digest, 'hex') FROM unnest(${configured.map(key => key.id)}::text[],
      ${configured.map(key => key.materialVerificationHmac.toString('hex'))}::text[]) candidate(key_name, digest)
    ORDER BY key_name ASC NULLS LAST
    ON CONFLICT (key_name) DO NOTHING`)
  // Material verification is immutable. No version-row locks precede later identity locks.
  const { rows } = await query<{
    id: string
    material_verification_hmac: Buffer
  }>(sql`/* verifyCopyrightReplayKeyVersions */
    SELECT key_name AS id, material_verification_hmac FROM copyright_replay_hmac_key_versions
    WHERE key_name = ANY(${configured.map(key => key.id)}::text[])`)
  const byId = new Map(rows.map(row => [row.id, row.material_verification_hmac]))
  if (
    configured.some(key => {
      const stored = byId.get(key.id)
      return (
        !stored ||
        stored.length !== key.materialVerificationHmac.length ||
        !timingSafeEqual(stored, key.materialVerificationHmac)
      )
    })
  )
    throw new Error('Dedicated copyright replay key version material changed')
}
