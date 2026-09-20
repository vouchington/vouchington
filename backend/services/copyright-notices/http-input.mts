import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import type { CopyrightJurisdiction } from './types.mts'

const JURISDICTIONS = new Set<CopyrightJurisdiction>(['us_dmca'])

export function parseCopyrightNoticeForm(body: Record<string, unknown>) {
  const jurisdiction = body.jurisdiction
  const claimantDisplayName = body.claimant_display_name
  const claimantContact = body.claimant_contact
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
  assert(boundedString(workDescription, 50_000), 422, 'work_description is required')
  assert(goodFaithBelief === true, 422, 'good_faith_belief must be accepted')
  assert(
    accuracyAuthorityUnderPenaltyOfPerjury === true,
    422,
    'accuracy_authority_under_penalty_of_perjury must be accepted',
  )
  assert(boundedString(electronicSignature, 500), 422, 'electronic_signature is required')
  assert(
    Array.isArray(body.targets) && body.targets.length > 0 && body.targets.length <= 20,
    422,
    'targets must contain 1 to 20 hosted images',
  )
  const targets = body.targets.map(target => {
    const item = target as Record<string, unknown>
    assert(
      typeof item.post_id === 'string' && isUUID(item.post_id),
      422,
      'targets[].post_id must be a UUID',
    )
    assert(
      typeof item.image_id === 'string' && isUUID(item.image_id),
      422,
      'targets[].image_id must be a UUID',
    )
    assert(boundedString(item.target_url, 2048), 422, 'targets[].target_url is required')
    return {
      postId: item.post_id as string,
      imageId: item.image_id as string,
      hostedUseUrl: item.target_url,
    }
  })
  return {
    jurisdiction: jurisdiction as CopyrightJurisdiction,
    claimantDisplayName: claimantDisplayName as string | null,
    claimantContact,
    workDescription,
    goodFaithBelief,
    accuracyAuthorityUnderPenaltyOfPerjury,
    electronicSignature,
    targets,
  }
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
