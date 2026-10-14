import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { completeOAuthAuthorizationExchange } from './authorization-exchange-completion.mts'

describe('completeOAuthAuthorizationExchange', () => {
  it('rejects providers outside the durable broker', async () => {
    await expect(
      completeOAuthAuthorizationExchange(
        'google',
        randomUUID(),
        randomUUID(),
        'google-user',
        queryWithRowCount(1),
      ),
    ).rejects.toThrow('OAuth authorization broker does not support google')
  })

  it('fails a stale fencing claim without overwriting newer exchange state', async () => {
    await expect(
      completeOAuthAuthorizationExchange(
        'github',
        randomUUID(),
        randomUUID(),
        'github-user',
        queryWithRowCount(0),
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('binds the provider account and fencing claim to the atomic update', async () => {
    const authorizationId = randomUUID()
    const claimId = randomUUID()
    const query = queryWithRowCount(1)

    await completeOAuthAuthorizationExchange(
      'facebook',
      authorizationId,
      claimId,
      'facebook-user',
      query,
    )

    expect(query).toHaveBeenCalledWith(expect.stringContaining('facebook_user_id = $2'), [
      authorizationId,
      'facebook-user',
      'facebook',
      claimId,
    ])
  })

  it('binds a LinkedIn account to the same fenced completion update', async () => {
    const authorizationId = randomUUID()
    const claimId = randomUUID()
    const query = queryWithRowCount(1)

    await completeOAuthAuthorizationExchange(
      'linkedin',
      authorizationId,
      claimId,
      '00000000-0000-7000-8000-000000000123',
      query,
    )

    expect(query).toHaveBeenCalledWith(expect.stringContaining('linkedin_account_id = $2'), [
      authorizationId,
      '00000000-0000-7000-8000-000000000123',
      'linkedin',
      claimId,
    ])
  })
})

function queryWithRowCount(rowCount: number): TransactionQuery {
  return vi.fn<
    () => Promise<{
      command: string
      fields: never[]
      oid: number
      rows: never[]
      rowCount: number
    }>
  >(async () => ({
    command: 'UPDATE',
    fields: [],
    oid: 0,
    rows: [],
    rowCount,
  })) as unknown as TransactionQuery
}
