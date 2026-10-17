import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { getAuthorizationAccount } from '../authorization-account-lookup.mts'
import type { CompletionRow } from '../authorization-completion-types.mts'

describe('Microsoft OAuth completion account lookup', () => {
  it('loads by the internal UUID while preserving the external provider identifier', async () => {
    const accountId = '019c1234-1234-7123-8123-123456789abc'
    const authorization = {
      provider: 'microsoft',
      microsoft_account_id: accountId,
    } as CompletionRow
    let statement = ''
    let parameters: readonly unknown[] = []
    const query = (async (sql: string, values: readonly unknown[] = []) => {
      statement = sql
      parameters = values
      return {
        command: '',
        fields: [],
        oid: 0,
        rows: [
          {
            user_id: null,
            provider_user_id: 'microsoft-external-id',
            provider_user_email_address: null,
            provider_user_data: {},
          },
        ],
        rowCount: 1,
      }
    }) as unknown as TransactionQuery

    const account = await getAuthorizationAccount(authorization, query)

    expect(statement).toContain('FROM microsoft_accounts')
    expect(statement).toContain('WHERE id = $1')
    expect(parameters).toEqual([accountId])
    expect(account.provider_user_id).toBe('microsoft-external-id')
  })
})

describe('Google OAuth completion account lookup', () => {
  it('loads the Google account by internal row ID and retains sub as provider identity', async () => {
    const accountId = '019c1234-1234-7123-8123-123456789abc'
    let statement = ''
    let parameters: readonly unknown[] = []
    const query = (async (sql: string, values: readonly unknown[] = []) => {
      statement = sql
      parameters = values
      return {
        command: '',
        fields: [],
        oid: 0,
        rows: [
          {
            account_id: accountId,
            user_id: null,
            provider_user_id: 'google-stable-subject',
            provider_user_email_address: null,
            provider_user_data: {},
          },
        ],
        rowCount: 1,
      }
    }) as unknown as TransactionQuery

    const account = await getAuthorizationAccount(
      { provider: 'google', google_account_id: accountId } as CompletionRow,
      query,
    )

    expect(statement).toContain('FROM google_accounts')
    expect(statement).toContain('WHERE id = $1')
    expect(parameters).toEqual([accountId])
    expect(account.provider_user_id).toBe('google-stable-subject')
  })
})
