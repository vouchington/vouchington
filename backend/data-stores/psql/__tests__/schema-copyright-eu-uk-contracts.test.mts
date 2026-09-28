import { afterAll, describe, expect, it } from 'vitest'
import {
  countTerritorialContractTables,
  readTerritorialClockColumnNames,
  rejectEuReceiptForUsNotice,
  rejectUsTerritorialPolicyApproval,
} from '../../../test-helpers/data-stores/psql/copyright-eu-uk-contracts.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright EU and UK contract schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('stores the territorial contract tables without US clock columns', async () => {
    await expect(countTerritorialContractTables()).resolves.toBe(9)
    await expect(readTerritorialClockColumnNames()).resolves.toEqual([])
  })

  it('rejects a US DMCA territorial policy approval', async () => {
    await expect(rejectUsTerritorialPolicyApproval()).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects an EU receipt for a US DMCA notice', async () => {
    await expect(rejectEuReceiptForUsNotice()).rejects.toMatchObject({ code: '23514' })
  })
})
