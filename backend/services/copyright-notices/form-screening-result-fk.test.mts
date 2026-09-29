import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  readTestCopyrightScreeningExecution,
  selectTestCopyrightScreeningResult,
} from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'

describe('current copyright screening result foreign key', () => {
  it('rejects selecting another intake result without changing current execution', async () => {
    const [owned, other] = await Promise.all([createClearScreenedForm(), createClearScreenedForm()])
    const before = await readTestCopyrightScreeningExecution(owned.notice.intake.id)
    await expect(
      selectTestCopyrightScreeningResult(owned.notice.intake.id, other.screeningId),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(readTestCopyrightScreeningExecution(owned.notice.intake.id)).resolves.toEqual(
      before,
    )
  })
  it('rejects selecting a nonexistent result without changing current execution', async () => {
    const { notice } = await createClearScreenedForm()
    const before = await readTestCopyrightScreeningExecution(notice.intake.id)
    await expect(
      selectTestCopyrightScreeningResult(notice.intake.id, randomUUID()),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(readTestCopyrightScreeningExecution(notice.intake.id)).resolves.toEqual(before)
  })
})
