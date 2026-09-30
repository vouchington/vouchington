import {
  COPYRIGHT_FORM_GUIDANCE_ELEMENTS,
  type CopyrightFormGuidance,
} from '../../../services/copyright-notices/form-screening-guidance.mts'

/** Valid moderator guidance for tests that persist a completed form screening. */
export const testCopyrightFormGuidance: CopyrightFormGuidance = {
  summary: 'A claimant reports an unlicensed copy of an original photograph.',
  elements: COPYRIGHT_FORM_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: 'present',
    gap: null,
  })),
  risk_notes: [],
  suggested_action: 'approve_intake',
}
