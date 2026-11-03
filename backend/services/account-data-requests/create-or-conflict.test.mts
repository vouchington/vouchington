import { randomUUID } from 'node:crypto'

import { describe, expect, it, onTestFinished } from 'vitest'
import { answerPostgresReadsForTest } from '@voucha/test-helpers/injected-failures'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createDataRequest } from './create.mts'
import { createDataRequestOrConflict } from './create-or-conflict.mts'
import { getLatestDataRequest } from './get.mts'
import { markDataRequestFailed } from './update.mts'

describe('createDataRequestOrConflict', () => {
  it('returns conflict when insert races and hits active unique index (23505)', async () => {
    const subject = await createTestUser()
    const existing = await createDataRequest(subject.id, subject.id)
    onTestFinished(answerPostgresReadsForTest('/* getLatestDataRequest */', [[]]))

    const result = await createDataRequestOrConflict(subject.id, subject.id)

    expect(result).toEqual({ type: 'conflict', existing })
  })

  it('returns null conflict metadata when the follow-up read is no longer active', async () => {
    const subject = await createTestUser()
    const failed = await createDataRequest(subject.id, subject.id)
    await markDataRequestFailed(failed.id)
    const failedLatest = await getLatestDataRequest(subject.id, subject.id)
    expect(failedLatest).toMatchObject({ id: failed.id, status: 'failed' })
    await createDataRequest(subject.id, subject.id)
    onTestFinished(
      answerPostgresReadsForTest('/* getLatestDataRequest */', [[], [{ ...failedLatest }]]),
    )

    const result = await createDataRequestOrConflict(subject.id, subject.id)

    expect(result).toEqual({ type: 'conflict', existing: null })
  })

  it('rethrows non-conflict insert errors', async () => {
    const subject = await createTestUser()

    await expect(createDataRequestOrConflict(subject.id, randomUUID())).rejects.toMatchObject({
      code: '23503',
    })
  })
})
