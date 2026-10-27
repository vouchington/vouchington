import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { providerTableConfigs, type OAuthProvider } from './providers.mts'

export type VerifiedLoginFirstFactor =
  | { type: 'email'; emailAddress: string }
  | { type: 'provider'; provider: OAuthProvider; providerUserId: string }

/** Credential removal and principal issuance serialize under the same owning user fence. */
export async function lockLoginCredentialAdmission(
  currentUserId: string,
  proof: VerifiedLoginFirstFactor,
  query: TransactionQuery,
): Promise<void> {
  await query(
    '/* lockLoginCredentialAdmission:userFence */ SELECT fn_lock_active_user_for_mutation($1)',
    [currentUserId],
  )
  await query(
    '/* lockLoginCredentialAdmission:userRow */ SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [currentUserId],
  )
  const result =
    proof.type === 'email'
      ? await query(
          '/* lockLoginCredentialAdmission:email */ SELECT 1 FROM user_email_addresses WHERE user_id = $1 AND email_address = $2',
          [currentUserId, proof.emailAddress],
        )
      : await readLinkedProviderCredential(currentUserId, proof, query)
  if (result.rows.length !== 1)
    throw createHttpError(401, 'Sign-in method is no longer connected to this account')
}

function readLinkedProviderCredential(
  currentUserId: string,
  proof: Extract<VerifiedLoginFirstFactor, { type: 'provider' }>,
  query: TransactionQuery,
) {
  const config = providerTableConfigs[proof.provider]
  return query(
    `/* lockLoginCredentialAdmission:provider */ SELECT 1 FROM ${config.table}
    WHERE user_id = $1 AND ${config.providerUserIdColumn} = $2`,
    [currentUserId, proof.providerUserId],
  )
}
