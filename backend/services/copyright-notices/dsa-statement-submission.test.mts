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
  seedTestDsaFailureRound,
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
  overrides: Partial<ProcessDsaStatementSubmissionDependencies> = {},
) {
  return processDsaStatementSubmission(submissionId, {
    isEnabled: async () => true,
    getFrom: async () => from(),
    requestFetch: fetchResponse(response),
    ...credentials,
    recordFailure: vi.fn<ProcessDsaStatementSubmissionDependencies['recordFailure']>(),
    ...overrides,
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

  it('rechecks the switch, start date, and credentials after claiming without sending', async () => {
    const response = dsaTestResponse(201, { uuid: DSA_TEST_UUID })
    const requestFetch = fetchResponse(response)
    const cases: Array<{
      name: string
      expected: 'disabled' | 'configuration_missing' | 'not_claimable'
      overrides: Partial<ProcessDsaStatementSubmissionDependencies>
    }> = [
      {
        name: 'switch withdrawn',
        expected: 'disabled',
        overrides: {
          isEnabled: (() => {
            let reads = 0
            return async () => ++reads === 1
          })(),
        },
      },
      {
        name: 'start date unset',
        expected: 'configuration_missing',
        overrides: {
          getFrom: (() => {
            let reads = 0
            return async () => (++reads === 1 ? from() : null)
          })(),
        },
      },
      {
        name: 'start date moved past the restriction',
        expected: 'not_claimable',
        overrides: {
          getFrom: (() => {
            let reads = 0
            return async () => (++reads === 1 ? from() : new Date('2200-01-01T00:00:00.000Z'))
          })(),
        },
      },
      {
        name: 'credentials withdrawn',
        expected: 'configuration_missing',
        overrides: {
          token: (() => {
            let reads = 0
            return () => (++reads === 1 ? 'synthetic-token' : '')
          })(),
        },
      },
    ]
    for (const scenario of cases) {
      const id = await newSubmission()
      expect(
        (await processWith(id, response, { ...scenario.overrides, requestFetch })).status,
      ).toBe(scenario.expected)
      expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
      expect(await readTestDsaAttempts(id)).toEqual([])
    }
    expect(requestFetch).not.toHaveBeenCalled()
  })

  it('releases a claim when the configured endpoint fails its HTTPS allowlist', async () => {
    const id = await newSubmission()
    const requestFetch = fetchResponse(dsaTestResponse(201, { uuid: DSA_TEST_UUID }))
    expect(
      (
        await processWith(id, dsaTestResponse(201, { uuid: DSA_TEST_UUID }), {
          url: () => 'https://attacker.example/api/v1',
          requestFetch,
        })
      ).status,
    ).toBe('configuration_missing')
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect(requestFetch).not.toHaveBeenCalled()
  })

  it('reports a fifth expired worker lease without sending again', async () => {
    const id = await newSubmission()
    await seedTestDsaFailureRound(id, 1, 4)
    expect((await claimDsaStatementSubmission(id, from())).kind).toBe('claimed')
    await expireTestDsaSubmissionLease(id)
    const response = dsaTestResponse(201, { uuid: DSA_TEST_UUID })
    const requestFetch = fetchResponse(response)
    const report = vi.fn<ProcessDsaStatementSubmissionDependencies['recordFailure']>()
    expect(await processWith(id, response, { requestFetch, recordFailure: report })).toEqual({
      status: 'dead_lettered',
    })
    expect(report).toHaveBeenCalledExactlyOnceWith({ submissionId: id, statusCode: null })
    expect((await readTestDsaAttempts(id)).at(-1)).toMatchObject({
      attempt_number: 5,
      outcome: 'retryable_failure',
      error_code: 'lease_expired',
    })
    expect(requestFetch).not.toHaveBeenCalled()
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
