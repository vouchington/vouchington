import { expireDataRequests } from '@services/account-data-requests/update'
import { claimRecoverableDataRequests } from '@services/account-data-requests/recovery'
import { streamFacebookAccountsToSync } from '@services/friend-recommendations/accounts-to-sync'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Sparse due pages must be measured against their mostly ineligible backlog. */
export async function runSelectionWork3511Scenarios(): Promise<void> {
  registerScenarioContract('account-data-expiry-due', {
    seededRows: { user_data_requests: 15000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_user_data_requests__expiry_due'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 30 },
    ],
  })
  await runAndCapture(
    'account-data-expiry-due',
    async () => {
      if ((await expireDataRequests(10)).length !== 10)
        throw new Error('Expected a due account-data expiry page')
    },
    undefined,
    'expireDataRequests',
  )

  registerScenarioContract('account-data-recovery-due', {
    seededRows: { user_data_requests: 15000 },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_user_data_requests__dispatch_recovery_due',
          'idx_user_data_requests__processing_recovery_due',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'user_data_requests', max: 50 },
    ],
  })
  await runAndCapture(
    'account-data-recovery-due',
    async () => {
      const result = await claimRecoverableDataRequests(undefined, 10)
      if (result.requests.length !== 10)
        throw new Error('Expected a due account-data recovery page')
    },
    undefined,
    'claimRecoverableDataRequests:candidates',
  )

  registerScenarioContract('friend-account-sync-due', {
    seededRows: { facebook_accounts: 10000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['facebook_accounts_pkey'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'facebook_accounts', max: 1010 },
    ],
  })
  await runAndCapture(
    'friend-account-sync-due',
    async () => {
      let count = 0
      for await (const account of streamFacebookAccountsToSync({
        limits: { batchSize: 1000, maxRows: 1000 },
      })) {
        if (!account.id) throw new Error('Missing friend account identity')
        count++
      }
      if (count < 1 || count > 11) throw new Error('Expected a sparse friend-sync page')
    },
    undefined,
    'streamAccountsToSync',
  )
}
