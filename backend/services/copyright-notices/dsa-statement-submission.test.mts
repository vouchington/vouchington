import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  DSA_TEST_UUID,
  dsaTestDuplicateResponse,
  dsaTestResponse,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import {
  expireTestDsaSubmissionLease,
  makeTestDsaSubmissionDue,
  readTestDsaAttempts,
  readTestDsaSubmission,
  seedTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import {
  processDsaStatementSubmission,
  type ProcessDsaStatementSubmissionDependencies,
} from './dsa-statement-submission.mts'
import { replayDsaStatementSubmission } from './dsa-statement-submission-replay.mts'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'

const credentials = {
  url: () => 'https://transparency.dsa.ec.europa.eu/api/v1',
  token: () => 'synthetic-token',
}
const from = () => new Date('2020-01-01T00:00:00.000Z')

async function newSubmission(): Promise<string> {
  const image = await createTestCopyrightImageFixture('post-image')
  const restriction = await createTestCopyrightRestrictionForImage(image)
  return seedTestDsaSubmission(restriction.restrictionId)
}

function fetchResponse(response: Response): ReturnType<typeof getExternalFetch> {
  return vi.fn<ReturnType<typeof getExternalFetch>>(async () => response) as unknown as ReturnType<
    typeof getExternalFetch
  >
}

async function processWith(
  submissionId: string,
  response: Response,
  overrides: {
    isEnabled?: () => Promise<boolean>
    getFrom?: () => Promise<Date | null>
    recordFailure?: ProcessDsaStatementSubmissionDependencies['recordFailure']
    requestFetch?: ReturnType<typeof getExternalFetch>
  } = {},
) {
  return processDsaStatementSubmission(submissionId, {
    isEnabled: overrides.isEnabled ?? (async () => true),
    getFrom: overrides.getFrom ?? (async () => from()),
    requestFetch: overrides.requestFetch ?? fetchResponse(response),
    ...credentials,
    recordFailure:
      overrides.recordFailure ??
      vi.fn<ProcessDsaStatementSubmissionDependencies['recordFailure']>(),
  })
}

describe('durable DSA statement submission', () => {
  it('keeps the ledger empty while off, without a start date, or without credentials', async () => {
    const id = await newSubmission()
    const response = dsaTestResponse(201, { uuid: DSA_TEST_UUID })
    const requestFetch = fetchResponse(response)
    expect(
      (await processWith(id, response, { isEnabled: async () => false, requestFetch })).status,
    ).toBe('disabled')
    expect(
      (await processWith(id, response, { getFrom: async () => null, requestFetch })).status,
    ).toBe('configuration_missing')
    expect(
      (
        await processDsaStatementSubmission(id, {
          isEnabled: async () => true,
          getFrom: async () => from(),
          url: () => '',
          token: () => '',
          requestFetch,
        })
      ).status,
    ).toBe('configuration_missing')
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(requestFetch).not.toHaveBeenCalled()
  })

  it('does not claim an earlier restriction after the operator moves the start date', async () => {
    const id = await newSubmission()
    const response = dsaTestResponse(201, { uuid: DSA_TEST_UUID })
    expect(
      (
        await processWith(id, response, {
          getFrom: async () => new Date('2200-01-01T00:00:00.000Z'),
        })
      ).status,
    ).toBe('not_claimable')
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
  })

  it('records a permanent 422 once and will not claim it again', async () => {
    const id = await newSubmission()
    const response = dsaTestResponse(422, { message: 'invalid synthetic statement' })
    await expect(processWith(id, response)).resolves.toMatchObject({
      status: 'permanent_failure',
      recorded: true,
      deadLettered: true,
    })
    expect((await processWith(id, response)).status).toBe('dead_lettered')
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'permanent_failure', error_code: 'http_422' },
    ])
  })

  it('records one success and treats duplicate PUID as idempotent success', async () => {
    for (const response of [
      dsaTestResponse(201, { uuid: DSA_TEST_UUID }),
      dsaTestDuplicateResponse(),
    ]) {
      const id = await newSubmission()
      await expect(processWith(id, response)).resolves.toMatchObject({
        status: 'submitted',
        recorded: true,
      })
      expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
      expect(await readTestDsaAttempts(id)).toMatchObject([
        { attempt_number: 1, outcome: 'submitted' },
      ])
      expect((await processWith(id, response)).status).toBe('not_claimable')
    }
  })

  it('dead-letters after five retryable failures and starts a fresh round on replay', async () => {
    const id = await newSubmission()
    const response = dsaTestResponse(503, { message: 'synthetic outage' })
    const report = vi.fn<ProcessDsaStatementSubmissionDependencies['recordFailure']>()
    const availableAtTimes: number[] = []
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await makeTestDsaSubmissionDue(id)
      const result = await processWith(id, response, { recordFailure: report })
      expect(result).toMatchObject({
        status: 'retryable_failure',
        recorded: true,
        deadLettered: attempt === 5,
      })
      const item = await readTestDsaSubmission(id)
      expect(item.lease_token).toBeNull()
      availableAtTimes.push(item.available_at.getTime())
    }
    expect(availableAtTimes[1]).toBeGreaterThan(availableAtTimes[0]!)
    expect(availableAtTimes[2]).toBeGreaterThan(availableAtTimes[1]!)
    expect(availableAtTimes[3]).toBeGreaterThan(availableAtTimes[2]!)
    expect(report).toHaveBeenCalledExactlyOnceWith({ submissionId: id, statusCode: 503 })
    expect((await readTestDsaAttempts(id)).map(row => row.error_code)).toEqual(
      Array(5).fill('http_503'),
    )
    expect((await processWith(id, response)).status).toBe('dead_lettered')
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(false)
    expect((await readTestDsaAttempts(id)).at(-1)).toMatchObject({
      attempt_number: 6,
      outcome: 'replayed',
      replayed_by_id: administrator.id,
    })
    await expect(
      processWith(id, dsaTestResponse(201, { uuid: DSA_TEST_UUID })),
    ).resolves.toMatchObject({
      status: 'submitted',
      recorded: true,
    })
    expect((await readTestDsaAttempts(id)).map(row => row.outcome)).toEqual([
      ...Array(5).fill('retryable_failure'),
      'replayed',
      'submitted',
    ])
  })

  it('counts expired worker leases and dead-letters the fifth crash', async () => {
    const id = await newSubmission()
    expect((await claimDsaStatementSubmission(id, from())).kind).toBe('claimed')
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expireTestDsaSubmissionLease(id)
      const result = await claimDsaStatementSubmission(id, from())
      expect(result.kind).toBe(attempt === 5 ? 'lease_expired' : 'claimed')
    }
    expect((await claimDsaStatementSubmission(id, from())).kind).toBe('dead_lettered')
    expect((await readTestDsaAttempts(id)).map(row => row.error_code)).toEqual(
      Array(5).fill('lease_expired'),
    )
  })
})
