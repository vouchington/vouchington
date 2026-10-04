import assert from 'http-assert'
import { assertBoundedText } from './territorial-fields.mts'

export type CreateCopyrightTrustedFlaggerInput = {
  name: string
  userId: string
  awardingCoordinatorName: string
  awardingMemberState: string
  awardedAt: string
  awardReference?: string | null
  areaOfExpertise: 'intellectual_property' | 'other'
  areaDescription: string
}

/** Service validation also covers non-HTTP callers. The route has the same closed contract. */
export function validateTrustedFlaggerInput(input: CreateCopyrightTrustedFlaggerInput) {
  const name = assertBoundedText(input.name, 200, 'name is required')
  const coordinator = assertBoundedText(
    input.awardingCoordinatorName,
    200,
    'awarding_coordinator_name is required',
  )
  const areaDescription = assertBoundedText(
    input.areaDescription,
    500,
    'area_description is required',
  )
  assert(/^[A-Z]{2}$/.test(input.awardingMemberState), 422, 'awarding_member_state is invalid')
  assert(
    input.areaOfExpertise === 'intellectual_property' || input.areaOfExpertise === 'other',
    422,
    'area_of_expertise is invalid',
  )
  const awardedAt = input.awardedAt
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(awardedAt) &&
      awardedAt.slice(0, 4) !== '0000' &&
      !Number.isNaN(Date.parse(`${awardedAt}T00:00:00.000Z`)) &&
      new Date(`${awardedAt}T00:00:00.000Z`).toISOString().slice(0, 10) === awardedAt,
    422,
    'awarded_at is invalid',
  )
  const awardReference =
    input.awardReference == null
      ? null
      : assertBoundedText(input.awardReference, 2048, 'award_reference is invalid')
  return {
    name,
    coordinator,
    memberState: input.awardingMemberState,
    awardedAt,
    awardReference,
    areaOfExpertise: input.areaOfExpertise,
    areaDescription,
  }
}

export function validateTrustedFlaggerChangeReason(reason: string): string {
  return assertBoundedText(reason, 4000, 'reason is required')
}
