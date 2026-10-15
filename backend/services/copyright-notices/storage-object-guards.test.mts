import { describe, expect, it } from 'vitest'
import {
  insertCopyrightArtifactWithoutStorageObject,
  insertCopyrightIntakeWithoutStorageObject,
} from '@voucha/test-helpers/copyright-storage-object-guard'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { recordThreadedCopyrightEmail } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'

describe('copyright stored-original guards', () => {
  it('rejects artifact metadata without a stored object', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    await expect(insertCopyrightArtifactWithoutStorageObject(entry.noticeId)).rejects.toMatchObject(
      {
        code: '23514',
      },
    )
  })

  it('rejects an email intake without its original MIME object', async () => {
    const intake = await recordThreadedCopyrightEmail({ messageId: null, replyReferences: [] })
    await expect(insertCopyrightIntakeWithoutStorageObject(intake.intakeId)).rejects.toMatchObject({
      code: '23514',
    })
  })
})
