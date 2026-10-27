import {
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { VerifiedRegistrationResponse } from '@simplewebauthn/server'
import type { PublicPasskey } from './types.mts'
import { enqueueRecalculateUserVoteWeightBestEffort } from '@queues/vote-aggregation/enqueues/vote-weight'

export async function createPasskey(
  userId: string,
  registrationInfo: NonNullable<VerifiedRegistrationResponse['registrationInfo']>,
  name: string,
  options: { query?: TransactionQuery } = {},
): Promise<PublicPasskey> {
  const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo

  const publicKeyBuffer = Buffer.from(credential.publicKey)

  return runWithTransaction(options.query, async query => {
    await query(sql`/* createPasskey */ SELECT fn_lock_active_user_for_mutation(${userId})`)
    await query(sql`/* createPasskey: mark vote weight dirty */
    UPDATE users SET vote_weight_recalculated_at = NULL WHERE id = ${userId}`)
    const { rows } = await query<PublicPasskey>(sql`/* createPasskey */
      INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, device_type, is_backed_up, transports, name)
      VALUES (
        ${userId},
        ${credential.id},
        ${publicKeyBuffer},
        ${credential.counter},
        ${credentialDeviceType},
        ${credentialBackedUp},
        ${credential.transports ?? null},
        ${name}
      )
      RETURNING id, name, device_type, is_backed_up, created_at, last_used_at
    `)
    const passkey = rows[0]
    if (!passkey) throw new Error('createPasskey: INSERT returned no rows')

    registerPostCommitAction(query, async () => {
      await enqueueRecalculateUserVoteWeightBestEffort(userId)
    })
    return passkey
  })
}
