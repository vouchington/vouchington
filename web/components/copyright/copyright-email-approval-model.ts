import type { CopyrightNoticeTargetInput } from '@/lib/api/client/copyright-notices'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'

export type CopyrightEmailApprovalTarget = {
  id: string
  group_id: string
  surface: CopyrightNoticeTargetInput['surface']
  post_id: string
  user_id?: string
  user_profile_link_id?: string
  topic_id?: string
  community_id?: string
  image_id: string
  target_url: string
  resolution_status: 'pending' | 'resolved' | 'failed'
}

export const MAX_EMAIL_APPROVAL_TARGETS = 20

export type CopyrightEmailApprovalDraft = {
  jurisdiction: 'us_dmca'
  claimant_display_name: string
  claimant_contact: string
  claimant_email: string
  work_description: string
  has_good_faith_belief: boolean
  has_accuracy_authority_under_penalty_of_perjury: boolean
  electronic_signature: string
  targets: CopyrightEmailApprovalTarget[]
}

function blankTarget(target_url = ''): CopyrightEmailApprovalTarget {
  const id = crypto.randomUUID()
  return {
    id,
    group_id: id,
    surface: 'post-image',
    post_id: '',
    image_id: '',
    target_url,
    resolution_status: 'pending',
  }
}

export function createCopyrightEmailApprovalDraft(
  output: Record<string, unknown> | undefined,
): CopyrightEmailApprovalDraft {
  const targetUrls = Array.isArray(output?.target_urls)
    ? output.target_urls.filter((value): value is string => typeof value === 'string')
    : []
  return {
    jurisdiction: 'us_dmca',
    claimant_display_name: stringValue(output?.claimant_name),
    claimant_contact: stringValue(output?.claimant_contact),
    claimant_email: stringValue(output?.claimant_email),
    work_description: stringValue(output?.work_description),
    has_good_faith_belief: output?.has_good_faith_belief === true,
    has_accuracy_authority_under_penalty_of_perjury:
      output?.has_accuracy_authority_under_penalty_of_perjury === true,
    electronic_signature: stringValue(output?.electronic_signature),
    targets: (targetUrls.length > 0 ? targetUrls : ['']).map(blankTarget),
  }
}

export function addCopyrightEmailApprovalTarget(
  draft: CopyrightEmailApprovalDraft,
): CopyrightEmailApprovalDraft {
  if (draft.targets.length >= MAX_EMAIL_APPROVAL_TARGETS) return draft
  return { ...draft, targets: [...draft.targets, blankTarget()] }
}

export function copyrightEmailApprovalTargetKey(target: CopyrightEmailApprovalTarget): string {
  const ownerId =
    target.surface === 'post-image'
      ? target.post_id
      : target.surface === 'user-profile-image'
        ? target.user_id
        : target.surface === 'user-profile-link-image'
          ? target.user_profile_link_id
          : target.surface === 'topic-logo-image' || target.surface === 'topic-hero-image'
            ? target.topic_id
            : target.community_id
  return `${target.surface}:${ownerId ?? ''}:${target.image_id}`
}

export function approvalTargetFields(
  choice: CopyrightNoticeResolvedTarget,
): Pick<
  CopyrightEmailApprovalTarget,
  | 'surface'
  | 'post_id'
  | 'user_id'
  | 'user_profile_link_id'
  | 'topic_id'
  | 'community_id'
  | 'image_id'
  | 'target_url'
> {
  return {
    surface: choice.surface,
    post_id: choice.surface === 'post-image' ? choice.post_id : '',
    user_id: choice.surface === 'user-profile-image' ? choice.user_id : undefined,
    user_profile_link_id:
      choice.surface === 'user-profile-link-image' ? choice.user_profile_link_id : undefined,
    topic_id:
      choice.surface === 'topic-logo-image' || choice.surface === 'topic-hero-image'
        ? choice.topic_id
        : undefined,
    community_id:
      choice.surface === 'community-profile-image' || choice.surface === 'community-banner-image'
        ? choice.community_id
        : undefined,
    image_id: choice.image_id,
    target_url: choice.target_url,
  }
}

export function isCompleteCopyrightEmailApprovalDraft(draft: CopyrightEmailApprovalDraft): boolean {
  return Boolean(
    draft.claimant_contact.trim() &&
    draft.claimant_email.trim() &&
    draft.work_description.trim() &&
    draft.electronic_signature.trim() &&
    draft.has_good_faith_belief &&
    draft.has_accuracy_authority_under_penalty_of_perjury &&
    draft.targets.length > 0 &&
    draft.targets.length <= MAX_EMAIL_APPROVAL_TARGETS &&
    draft.targets.every(
      target =>
        target.resolution_status !== 'pending' &&
        ownerId(target)?.trim() &&
        target.image_id.trim() &&
        target.target_url.trim(),
    ),
  )
}

export function toCopyrightEmailApprovalInput(draft: CopyrightEmailApprovalDraft) {
  return {
    ...draft,
    targets: draft.targets.map(target => {
      const common = { image_id: target.image_id, target_url: target.target_url }
      switch (target.surface) {
        case 'post-image':
          return { ...common, surface: target.surface, post_id: target.post_id }
        case 'user-profile-image':
          return { ...common, surface: target.surface, user_id: target.user_id }
        case 'user-profile-link-image':
          return {
            ...common,
            surface: target.surface,
            user_profile_link_id: target.user_profile_link_id,
          }
        case 'topic-logo-image':
        case 'topic-hero-image':
          return { ...common, surface: target.surface, topic_id: target.topic_id }
        case 'community-profile-image':
        case 'community-banner-image':
          return { ...common, surface: target.surface, community_id: target.community_id }
      }
      throw new Error('Unsupported copyright image surface')
    }),
  }
}

function ownerId(target: CopyrightEmailApprovalTarget): string | undefined {
  switch (target.surface) {
    case 'post-image':
      return target.post_id
    case 'user-profile-image':
      return target.user_id
    case 'user-profile-link-image':
      return target.user_profile_link_id
    case 'topic-logo-image':
    case 'topic-hero-image':
      return target.topic_id
    case 'community-profile-image':
    case 'community-banner-image':
      return target.community_id
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
