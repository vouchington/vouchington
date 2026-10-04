import { describe, expect, it } from 'vitest'
import {
  approvalTargetFields,
  createCopyrightEmailApprovalDraft,
  isCompleteCopyrightEmailApprovalDraft,
  toCopyrightEmailApprovalInput,
} from './copyright-email-approval-model'

describe('email copyright approval targets', () => {
  it('sends a resolved profile-link image with its link ID and no draft fields', () => {
    const draft = createCopyrightEmailApprovalDraft({
      target_urls: ['https://voucha.ai/user/alice'],
    })
    draft.claimant_contact = '1 Main St'
    draft.claimant_email = 'claimant@example.test'
    draft.work_description = 'Photo'
    draft.electronic_signature = 'Claimant'
    draft.good_faith_belief = true
    draft.accuracy_authority_under_penalty_of_perjury = true
    draft.targets[0] = {
      ...draft.targets[0]!,
      ...approvalTargetFields({
        surface: 'user-profile-link-image',
        user_profile_link_id: 'link-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/user/alice',
        order_index: 0,
        caption: 'Portfolio image',
      }),
      resolution_status: 'resolved',
    }
    expect(isCompleteCopyrightEmailApprovalDraft(draft)).toBe(true)
    expect(toCopyrightEmailApprovalInput(draft).targets).toEqual([
      {
        surface: 'user-profile-link-image',
        user_profile_link_id: 'link-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/user/alice',
      },
    ])
  })
})
