import { describe, expect, it } from 'vitest'
import { appendTestCopyrightFormScreening } from '@voucha/test-helpers/copyright-form-screenings'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { copyrightSweepConfig } from './work-limits.mts'

async function fileScreenedNotice() {
  const { intake } = await createSignedInCopyrightForm()
  await appendTestCopyrightFormScreening({
    intakeId: intake.id,
    inputSha256: Buffer.alloc(32, 1),
    recommendation: 'not_obviously_invalid',
    rationale: 'Complete notice.',
    guidance: {
      ...testCopyrightFormGuidance,
      risk_notes: [
        { kind: 'possible_fair_use', note: 'The post quotes a short excerpt.' },
        { kind: 'mismatched_claimant', note: 'Check the original attribution.' },
      ],
    },
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  return intake.copyright_notice_id
}

describe('copyright form screening risk notes', () => {
  it('caps new risk notes at the configured value and keeps stored guidance readable', async () => {
    const existingNoticeId = await fileScreenedNotice()
    const restore = overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
      form_screening_risk_notes_max: 1,
    })
    try {
      const newNoticeId = await fileScreenedNotice()
      const [existing, current] = await Promise.all([
        readTestCopyrightStaffScreening(existingNoticeId),
        readTestCopyrightStaffScreening(newNoticeId),
      ])
      expect(existing?.guidance?.risk_notes).toHaveLength(2)
      expect(current?.guidance?.risk_notes).toEqual([
        { kind: 'possible_fair_use', note: 'The post quotes a short excerpt.' },
      ])
    } finally {
      restore()
    }
  })
})
