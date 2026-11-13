import { appendCopyrightSubmissionGuidance } from '../services/copyright-notices/submission-guidance.mts'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  type CopyrightCounterNoticeGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
const counterGuidance: CopyrightCounterNoticeGuidance = {
  summary: 'The required declarations are present.',
  elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: 'present' as const,
    gap: null,
  })),
  risk_notes: [],
}
export async function addDisclosureCounterGuidance(
  submissionId: string,
  seed: number,
): Promise<void> {
  await appendCopyrightSubmissionGuidance({
    submissionId,
    inputSha256: Buffer.alloc(32, seed),
    promptVersion: 'test-copyright-submission-guidance-v1',
    model: 'test-model',
    guidance: counterGuidance,
  })
}
