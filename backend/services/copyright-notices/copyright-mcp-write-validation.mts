import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { getCopyrightStaffEmailIntake } from './read-models.mts'

export function validateCopyrightMcpConstructedRequest(
  path: string,
  pathValues: Record<string, string>,
  body?: Record<string, unknown>,
): void {
  const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(`POST:${path}`, {
    path: pathValues,
    ...(body ? { body } : {}),
  })
  assert(!error, 422, 'Invalid copyright decision request')
}

export async function loadCopyrightMcpEmailIntake(currentUser: PrivateUser, intakeId: string) {
  const intake = await getCopyrightStaffEmailIntake(intakeId, currentUser)
  assert(intake, 404, 'Copyright email intake not found')
  return intake
}

export function requireCopyrightMcpRecommendation(
  intake: NonNullable<Awaited<ReturnType<typeof getCopyrightStaffEmailIntake>>>,
) {
  assert(intake.recommendation, 422, 'A current copyright email recommendation is required')
  return intake.recommendation
}

export function copyrightMcpDecisionProvenance(
  intake: NonNullable<Awaited<ReturnType<typeof getCopyrightStaffEmailIntake>>>,
) {
  return intake.recommendation
    ? { recommendation_id: intake.recommendation.id }
    : { manual_fallback_reason: 'Staff rejected this email without an available recommendation.' }
}
