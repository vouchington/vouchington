import { describe, expect, it } from 'vitest'
import {
  approvalTargetFields,
  copyrightEmailApprovalTargetKey,
  createCopyrightEmailApprovalDraft,
  isCompleteCopyrightEmailApprovalDraft,
  toCopyrightEmailApprovalInput,
} from './copyright-email-approval-model'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'

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
  it.each([
    [{ surface: 'post-image', post_id: 'post-1' }, 'post-1'],
    [{ surface: 'user-profile-image', user_id: 'user-1' }, 'user-1'],
    [{ surface: 'user-profile-link-image', user_profile_link_id: 'link-1' }, 'link-1'],
    [{ surface: 'topic-logo-image', topic_id: 'topic-1' }, 'topic-1'],
    [{ surface: 'topic-hero-image', topic_id: 'topic-1' }, 'topic-1'],
    [{ surface: 'community-profile-image', community_id: 'community-1' }, 'community-1'],
    [{ surface: 'community-banner-image', community_id: 'community-1' }, 'community-1'],
  ] as const)('serializes only the %s owner on approval', (owner, ownerId) => {
    const choice = {
      ...owner,
      image_id: 'image-1',
      target_url: 'https://voucha.ai/discussion/one',
      order_index: 0,
      caption: 'Chosen image',
    } as CopyrightNoticeResolvedTarget
    const draft = createCopyrightEmailApprovalDraft({ target_urls: [choice.target_url] })
    draft.claimant_contact = '1 Main St'
    draft.claimant_email = 'claimant@example.test'
    draft.work_description = 'Photograph'
    draft.electronic_signature = 'Claimant'
    draft.good_faith_belief = true
    draft.accuracy_authority_under_penalty_of_perjury = true
    draft.targets[0] = {
      ...draft.targets[0]!,
      ...approvalTargetFields(choice),
      resolution_status: 'resolved',
    }
    expect(isCompleteCopyrightEmailApprovalDraft(draft)).toBe(true)
    expect(copyrightEmailApprovalTargetKey(draft.targets[0]!)).toBe(
      `${choice.surface}:${ownerId}:image-1`,
    )
    expect(toCopyrightEmailApprovalInput(draft).targets).toEqual([
      {
        ...owner,
        image_id: 'image-1',
        target_url: choice.target_url,
      },
    ])
  })
})
