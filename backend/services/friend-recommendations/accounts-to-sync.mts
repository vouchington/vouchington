import { createAsyncGeneratorFromCursor } from '@data-stores/psql'

export type AccountToSync = {
  provider_user_id: string
}

const SYNC_INTERVAL_HOURS = 24

export function streamFacebookAccountsToSync(): AsyncGenerator<AccountToSync> {
  return createAsyncGeneratorFromCursor<AccountToSync>(
    `/* streamFacebookAccountsToSync */ SELECT facebook_user_id AS provider_user_id
     FROM facebook_accounts
     WHERE user_id IS NOT NULL
       AND access_token_ciphertext IS NOT NULL
       AND (friends_synced_at IS NULL OR friends_synced_at < NOW() - $1 * INTERVAL '1 hour')`,
    [SYNC_INTERVAL_HOURS],
    { batchSize: 1000 },
  )
}

export function streamXAccountsToSync(): AsyncGenerator<AccountToSync> {
  return createAsyncGeneratorFromCursor<AccountToSync>(
    `/* streamXAccountsToSync */ SELECT x_user_id AS provider_user_id
     FROM x_accounts
     WHERE user_id IS NOT NULL
       AND access_token_ciphertext IS NOT NULL
       AND (access_token_expires_at IS NULL OR access_token_expires_at > NOW() OR refresh_token_ciphertext IS NOT NULL)
       AND (friends_synced_at IS NULL OR friends_synced_at < NOW() - $1 * INTERVAL '1 hour')`,
    [SYNC_INTERVAL_HOURS],
    { batchSize: 1000 },
  )
}

export function streamGithubAccountsToSync(): AsyncGenerator<AccountToSync> {
  return createAsyncGeneratorFromCursor<AccountToSync>(
    `/* streamGithubAccountsToSync */ SELECT github_user_id AS provider_user_id
     FROM github_accounts
     WHERE user_id IS NOT NULL
       AND access_token_ciphertext IS NOT NULL
       AND (friends_synced_at IS NULL OR friends_synced_at < NOW() - $1 * INTERVAL '1 hour')`,
    [SYNC_INTERVAL_HOURS],
    { batchSize: 1000 },
  )
}
