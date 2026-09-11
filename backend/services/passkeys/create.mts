import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { VerifiedRegistrationResponse } from '@simplewebauthn/server'
import type { PublicPasskey } from './types.mts'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'

export async function createPasskey(
  userId: string,
  registrationInfo: NonNullable<VerifiedRegistrationResponse['registrationInfo']>,
  name: string,
): Promise<PublicPasskey> {
  const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo

  const publicKeyBuffer = Buffer.from(credential.publicKey)

  await using query = await beginTransaction()
  await query(sql`/* createPasskey */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const { rows } = await query<PublicPasskey>(sql`/* createPasskey */
      INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
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
      RETURNING id, name, device_type, backed_up, created_at, last_used_at
    `)
  await query.commit()
  const passkey = rows[0]
  if (!passkey) throw new Error('createPasskey: INSERT returned no rows')

  /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
  void enqueueRecalculateUserVoteWeight(userId)
  return passkey
}
