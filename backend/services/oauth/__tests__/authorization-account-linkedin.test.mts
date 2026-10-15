import { describe, expect, it, vi } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'
import { getAuthorizationAccount } from '../authorization-completion-persistence.mts'
import type { CompletionRow } from '../authorization-completion-types.mts'

describe('LinkedIn OAuth completion account lookup', () => {
  it('uses the internal row ID while returning the external provider subject', async () => {
    const accountId = v7()
    const account = {
      user_id: null,
      provider_user_id: 'linkedin-external-subject',
      provider_user_email_address: null,
      provider_user_data: {},
    }
    const query = vi.fn<
      (
        sql: string,
        values: readonly unknown[],
      ) => Promise<{
        command: string
        fields: never[]
        oid: number
        rows: (typeof account)[]
        rowCount: number
      }>
    >(async () => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rows: [account],
      rowCount: 1,
    })) as unknown as TransactionQuery

    const actual = await getAuthorizationAccount(
      { provider: 'linkedin', linkedin_account_id: accountId } as CompletionRow,
      query,
    )

    expect(actual).toEqual(account)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM linkedin_accounts'), [
      accountId,
    ])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [accountId])
  })
})
