import { randomBytes } from 'node:crypto'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightCounterNoticeGuidance,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { copyrightSubmissionGuidance } from '../services/copyright-notices/submission-guidance.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Adds encrypted guidance to the filed counter-notice and hold in an existing retention case. */
export async function addTestCopyrightSubmissionGuidanceForRetentionCase(
  noticeId: string,
): Promise<void> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('retention guidance fixture notice is missing')
  const counter = aggregate.submissions.find(({ kind }) => kind === 'counter_notice')
  const hold = aggregate.submissions.find(({ kind }) => kind === 'court_or_ccb_hold')
  if (!counter || !hold) throw new Error('retention guidance fixture submissions are missing')

  const counterGuidance: CopyrightCounterNoticeGuidance = {
    summary: 'The filed counter-notice identifies the material and required statements.',
    elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
      element,
      status: 'present' as const,
      gap: null,
    })),
    risk_notes: [],
  }
  const holdGuidance: CopyrightLegalHoldGuidance = {
    summary: 'The filed court or CCB material identifies a proceeding and the same material.',
    criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
      criterion,
      status: 'present' as const,
      gap: null,
    })),
    risk_notes: [],
  }

  await copyrightSubmissionGuidance.append({
    submissionId: counter.id,
    inputSha256: randomBytes(32),
    promptVersion: 'retention-fixture-v1',
    model: 'retention-fixture',
    guidance: counterGuidance,
  })
  await copyrightSubmissionGuidance.append({
    submissionId: hold.id,
    inputSha256: randomBytes(32),
    promptVersion: 'retention-fixture-v1',
    model: 'retention-fixture',
    guidance: holdGuidance,
  })
}
