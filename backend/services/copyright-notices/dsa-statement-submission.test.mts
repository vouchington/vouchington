import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import Sentry from '@modules/on-error/sentry'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  DSA_TEST_UUID,
  dsaTestPayload,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import { stubDsaTransparencyDatabaseProvider } from '@voucha/test-helpers/dsa-transparency-database-provider'
import { configureDsaStatementSubmissionForTest } from '@voucha/test-helpers/dsa-switches'
import {
  expireTestDsaSubmissionLease,
  makeTestDsaSubmissionDue,
  readTestDsaAttempts,
  readTestDsaSubmission,
  seedTestDsaFailureRound,
  seedTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { processDsaStatementSubmission } from './dsa-statement-submission.mts'
import { replayDsaStatementSubmission } from './dsa-statement-submission-replay.mts'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'

const from = new Date('2020-01-01T00:00:00.000Z')

/** Switch on, start date 2020-01-01, and the synthetic provider credentials. */
async function configureSubmission(): Promise<void> {
  onTestFinished(await configureDsaStatementSubmissionForTest())
}

function spyOnDeadLetterReport() {
  return vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
}

describe('durable DSA statement submission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reports a fifth expired worker lease without sending again', async () => {
    const id = await createCommittedDsaSubmission()
    await configureSubmission()
    await seedTestDsaFailureRound(id, 1, 4)
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('claimed')
    await expireTestDsaSubmissionLease(id)
    const provider = stubDsaTransparencyDatabaseProvider()
    const report = spyOnDeadLetterReport()
    expect(await processDsaStatementSubmission(id)).toEqual({ status: 'dead_lettered' })
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'copyright_dsa_statement_submission_dead_lettered',
      {
        level: 'warning',
        tags: { reason: 'copyright_dsa_statement_submission_dead_lettered' },
        extra: { submissionId: id, statusCode: null },
      },
    )
    expect((await readTestDsaAttempts(id)).at(-1)).toMatchObject({
      attempt_number: 5,
      outcome: 'retryable_failure',
      error_code: 'lease_expired',
    })
    expect(provider.requests).toBe(0)
  })

  it('records a permanent 422 once and will not claim it again', async () => {
    const id = await createCommittedDsaSubmission()
    await configureSubmission()
    const provider = stubDsaTransparencyDatabaseProvider(() => ({
      statusCode: 422,
      body: { message: 'invalid synthetic statement' },
    }))
    const report = spyOnDeadLetterReport()
    await expect(processDsaStatementSubmission(id)).resolves.toMatchObject({
      status: 'permanent_failure',
      recorded: true,
      deadLettered: true,
    })
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'copyright_dsa_statement_submission_dead_lettered',
      {
        level: 'warning',
        tags: { reason: 'copyright_dsa_statement_submission_dead_lettered' },
        extra: { submissionId: id, statusCode: 422 },
      },
    )
    expect((await processDsaStatementSubmission(id)).status).toBe('dead_lettered')
    expect(provider.requests).toBe(1)
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'permanent_failure', error_code: 'http_422' },
    ])
  })

  it('sends the frozen payload with the bearer token and records one success', async () => {
    const { restrictionId } = await createCopyrightNoticeSchemaFixture()
    const id = await seedTestDsaSubmission(restrictionId)
    await configureSubmission()
    const provider = stubDsaTransparencyDatabaseProvider()
    await expect(processDsaStatementSubmission(id)).resolves.toEqual({
      status: 'submitted',
      recorded: true,
    })
    expect(provider.received).toHaveLength(1)
    const [request] = provider.received
    expect(request).toMatchObject({
      method: 'POST',
      path: '/api/v1/statement',
      headers: {
        authorization: 'Bearer synthetic-token',
        accept: 'application/json',
        'content-type': 'application/json',
      },
    })
    expect(JSON.parse(request!.body)).toEqual({ ...dsaTestPayload(), puid: restrictionId })
    expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'submitted' },
    ])
    expect((await processDsaStatementSubmission(id)).status).toBe('not_claimable')
    expect(provider.requests).toBe(1)
  })

  it('treats the duplicate PUID response as idempotent success', async () => {
    const id = await createCommittedDsaSubmission()
    await configureSubmission()
    const provider = stubDsaTransparencyDatabaseProvider(() => ({
      statusCode: 422,
      body: { existing: { uuid: DSA_TEST_UUID } },
    }))
    await expect(processDsaStatementSubmission(id)).resolves.toMatchObject({
      status: 'submitted',
      recorded: true,
    })
    expect((await readTestDsaSubmission(id)).transparency_database_uuid).toBe(DSA_TEST_UUID)
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'submitted' },
    ])
    expect((await processDsaStatementSubmission(id)).status).toBe('not_claimable')
    expect(provider.requests).toBe(1)
  })

  it('dead-letters after five retryable failures and starts a fresh round on replay', async () => {
    const id = await createCommittedDsaSubmission()
    await configureSubmission()
    let succeed = false
    const provider = stubDsaTransparencyDatabaseProvider(() =>
      succeed
        ? { statusCode: 201, body: { uuid: DSA_TEST_UUID } }
        : { statusCode: 503, body: { message: 'synthetic outage' } },
    )
    const report = spyOnDeadLetterReport()
    const availableAtTimes: number[] = []
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await makeTestDsaSubmissionDue(id)
      const result = await processDsaStatementSubmission(id)
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
    expect(report).toHaveBeenCalledExactlyOnceWith(
      'copyright_dsa_statement_submission_dead_lettered',
      {
        level: 'warning',
        tags: { reason: 'copyright_dsa_statement_submission_dead_lettered' },
        extra: { submissionId: id, statusCode: 503 },
      },
    )
    expect((await readTestDsaAttempts(id)).map(row => row.error_code)).toEqual(
      Array(5).fill('http_503'),
    )
    expect((await processDsaStatementSubmission(id)).status).toBe('dead_lettered')
    expect(provider.requests).toBe(5)
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(true)
    expect(await replayDsaStatementSubmission(administrator.id, id)).toBe(false)
    expect((await readTestDsaAttempts(id)).at(-1)).toMatchObject({
      attempt_number: 6,
      outcome: 'replayed',
      replayed_by_id: administrator.id,
    })
    succeed = true
    await expect(processDsaStatementSubmission(id)).resolves.toMatchObject({
      status: 'submitted',
      recorded: true,
    })
    expect((await readTestDsaAttempts(id)).map(row => row.outcome)).toEqual([
      ...Array(5).fill('retryable_failure'),
      'replayed',
      'submitted',
    ])
  })

  it('records a network failure as a retryable attempt', async () => {
    const id = await createCommittedDsaSubmission()
    await configureSubmission()
    stubDsaTransparencyDatabaseProvider(() => ({ error: new Error('synthetic socket reset') }))
    await expect(processDsaStatementSubmission(id)).resolves.toMatchObject({
      status: 'retryable_failure',
      recorded: true,
      deadLettered: false,
    })
    expect(await readTestDsaAttempts(id)).toMatchObject([
      { attempt_number: 1, outcome: 'retryable_failure', error_code: 'network_error' },
    ])
  })

  it('counts expired worker leases and dead-letters the fifth crash', async () => {
    const id = await createCommittedDsaSubmission()
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('claimed')
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expireTestDsaSubmissionLease(id)
      const result = await claimDsaStatementSubmission(id, from)
      expect(result.kind).toBe(attempt === 5 ? 'lease_expired' : 'claimed')
    }
    expect((await claimDsaStatementSubmission(id, from)).kind).toBe('dead_lettered')
    expect((await readTestDsaAttempts(id)).map(row => row.error_code)).toEqual(
      Array(5).fill('lease_expired'),
    )
  })
})

/** The worker's subject starts with committed legal authority, not another SERIAL request. */
async function createCommittedDsaSubmission() {
  const { restrictionId } = await createCopyrightNoticeSchemaFixture()
  return seedTestDsaSubmission(restrictionId)
}
