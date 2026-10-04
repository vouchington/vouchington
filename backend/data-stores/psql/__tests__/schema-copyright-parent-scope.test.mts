import { afterAll, describe, expect, it } from 'vitest'
import {
  rejectCopyrightEvidenceMissingParent,
  rejectCrossNoticeSubmissionTarget,
} from '../../../test-helpers/data-stores/psql/copyright-parent-scope.mts'
import { onGracefulShutdown } from '../index.mts'

describe('copyright composite parent scope', () => {
  afterAll(onGracefulShutdown)

  it('rejects an existing target under another notice', async () => {
    await expect(rejectCrossNoticeSubmissionTarget()).rejects.toMatchObject({ code: '23503' })
  })

  it('preserves FK violation semantics when the owning parent is missing', async () => {
    await expect(rejectCopyrightEvidenceMissingParent()).rejects.toMatchObject({ code: '23503' })
  })
})
