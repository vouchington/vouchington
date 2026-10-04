import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import type { CopyrightJurisdiction } from './types.mts'
import type { CopyrightImageSelector } from './placement-resolution.mts'

const JURISDICTIONS = new Set<CopyrightJurisdiction>(['us_dmca'])

export function parseCopyrightNoticeForm(body: Record<string, unknown>) {
  const jurisdiction = body.jurisdiction
  const claimantDisplayName = body.claimant_display_name
  const claimantContact = body.claimant_contact
  const claimantEmail = body.claimant_email
  const workDescription = body.work_description
  const goodFaithBelief = body.good_faith_belief
  const accuracyAuthorityUnderPenaltyOfPerjury = body.accuracy_authority_under_penalty_of_perjury
  const electronicSignature = body.electronic_signature
  assert(JURISDICTIONS.has(jurisdiction as CopyrightJurisdiction), 422, 'jurisdiction is required')
  assert(
    claimantDisplayName === null || boundedString(claimantDisplayName, 200),
    422,
    'Invalid claimant_display_name',
  )
  assert(boundedString(claimantContact, 4096), 422, 'claimant_contact is required')
  assert(
    boundedString(claimantEmail, 254) && isEmailAddress(claimantEmail),
    422,
    'claimant_email must be a valid email address',
  )
  assert(boundedString(workDescription, 50_000), 422, 'work_description is required')
  assert(goodFaithBelief === true, 422, 'good_faith_belief must be accepted')
  assert(
    accuracyAuthorityUnderPenaltyOfPerjury === true,
    422,
    'accuracy_authority_under_penalty_of_perjury must be accepted',
  )
  assert(boundedString(electronicSignature, 500), 422, 'electronic_signature is required')
  const targets = parseCopyrightTargets(body.targets)
  return {
    jurisdiction: jurisdiction as CopyrightJurisdiction,
    claimantDisplayName: claimantDisplayName as string | null,
    claimantContact,
    claimantEmail,
    workDescription,
    goodFaithBelief,
    accuracyAuthorityUnderPenaltyOfPerjury,
    electronicSignature,
    targets,
  }
}

export function parseCopyrightTargets(value: unknown): CopyrightImageSelector[] {
  assert(
    Array.isArray(value) && value.length > 0 && value.length <= 20,
    422,
    'targets must contain 1 to 20 hosted images',
  )
  const targets: CopyrightImageSelector[] = value.map(target => {
    assert(
      target && typeof target === 'object' && !Array.isArray(target),
      422,
      'targets[] must be an object',
    )
    const item = target as Record<string, unknown>
    const surface = item.surface
    const ownerField =
      surface === 'post-image'
        ? 'post_id'
        : surface === 'user-profile-image'
          ? 'user_id'
          : surface === 'user-profile-link-image'
            ? 'user_profile_link_id'
            : surface === 'topic-logo-image' || surface === 'topic-hero-image'
              ? 'topic_id'
              : surface === 'community-profile-image' || surface === 'community-banner-image'
                ? 'community_id'
                : null
    assert(ownerField, 422, 'targets[].surface is invalid')
    assert(
      typeof item[ownerField] === 'string' && isUUID(item[ownerField]),
      422,
      `targets[].${ownerField} must be a UUID`,
    )
    assert(
      typeof item.image_id === 'string' && isUUID(item.image_id),
      422,
      'targets[].image_id must be a UUID',
    )
    assert(boundedString(item.target_url, 2048), 422, 'targets[].target_url is required')
    const shared = { imageId: item.image_id as string, hostedUseUrl: item.target_url }
    switch (surface) {
      case 'post-image':
        return { ...shared, surfaceKind: surface, postId: item.post_id as string }
      case 'user-profile-image':
        return { ...shared, surfaceKind: surface, userId: item.user_id as string }
      case 'user-profile-link-image':
        return {
          ...shared,
          surfaceKind: surface,
          userProfileLinkId: item.user_profile_link_id as string,
        }
      case 'topic-logo-image':
      case 'topic-hero-image':
        return { ...shared, surfaceKind: surface, topicId: item.topic_id as string }
      case 'community-profile-image':
      case 'community-banner-image':
        return { ...shared, surfaceKind: surface, communityId: item.community_id as string }
    }
    throw new Error('Unknown copyright target surface')
  })
  const targetKeys = targets.map(target => {
    const owner =
      'postId' in target
        ? target.postId
        : 'userId' in target
          ? target.userId
          : 'userProfileLinkId' in target
            ? target.userProfileLinkId
            : 'topicId' in target
              ? target.topicId
              : target.communityId
    return `${target.surfaceKind}:${owner.toLowerCase()}:${target.imageId.toLowerCase()}`
  })
  assert(new Set(targetKeys).size === targets.length, 422, 'targets must be unique')
  return targets
}

export function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

export function parseCopyrightTargetIds(value: unknown): string[] {
  assert(
    Array.isArray(value) && value.length > 0 && value.length <= 20,
    422,
    'target_ids must contain 1 to 20 targets',
  )
  assert(
    value.every(item => typeof item === 'string' && isUUID(item)),
    422,
    'target_ids must be UUIDs',
  )
  assert(new Set(value).size === value.length, 422, 'target_ids must be unique')
  return value as string[]
}

export function parseCopyrightAppealForm(body: Record<string, unknown>) {
  const targetIds = parseCopyrightTargetIds(body.target_ids)
  const reason = body.reason
  assert(boundedString(reason, 50_000), 422, 'reason is required')
  return { reason, targetIds }
}

export function parseCopyrightCounterNoticeForm(body: Record<string, unknown>) {
  const targetIds = parseCopyrightTargetIds(body.target_ids)
  const { name, address, telephone, electronic_signature: electronicSignature } = body
  assert(
    boundedString(name, 200) &&
      boundedString(address, 4096) &&
      boundedString(telephone, 100) &&
      boundedString(electronicSignature, 500),
    422,
    'name, address, telephone, and electronic_signature are required',
  )
  assert(
    body.consent_to_federal_jurisdiction === true,
    422,
    'consent_to_federal_jurisdiction must be accepted',
  )
  assert(
    body.consent_to_service_of_process === true,
    422,
    'consent_to_service_of_process must be accepted',
  )
  assert(
    body.good_faith_misidentification_under_penalty_of_perjury === true,
    422,
    'good_faith_misidentification_under_penalty_of_perjury must be accepted',
  )
  return {
    name,
    address,
    telephone,
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature,
    targetIds,
  }
}
