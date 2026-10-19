import type { PrivateUser } from '@services/users/types'
import { assertCopyrightIntakeEnabled } from '@services/copyright-notices'
import { approveCopyrightEmailIntakeDecision } from '@services/copyright-notices/copyright-email-decision-actions'
import { parseCopyrightNoticeForm } from '@services/copyright-notices/http-input'
import {
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
} from '@services/copyright-notices/moderator-http-input'
import { validateCopyrightMcpConstructedRequest } from '@services/copyright-notices/copyright-mcp-write-validation'
import { UUID_INPUT } from './create-admin-tool.mts'
import {
  communityReferenceSchema,
  postReferenceSchema,
  topicReferenceSchema,
  userReferenceSchema,
} from '../entity-reference-schema.mts'
import { entityIdOrMissing } from '../resolve-entity-reference.mts'

export const APPROVE_COPYRIGHT_EMAIL_INTAKE_PATH = '/api/v1/copyright-email-intakes/:id/approvals'

/**
 * The `review_copyright_email_intake` approve option sends the REST approval body plus `intake_id`
 * (the route's `:id`). The shared parsers and the generated request contract still decide every
 * value, so this schema only needs to tell a caller what to send.
 */
function text(maxLength: number) {
  return { type: 'string', minLength: 1, pattern: '\\S', maxLength } as const
}
function nullable(schema: object) {
  return { anyOf: [schema, { type: 'null' }] }
}

const TARGET_OWNER_FIELDS = {
  'post-image': 'post_id',
  'user-profile-image': 'user_id',
  'user-profile-link-image': 'user_profile_link_id',
  'topic-logo-image': 'topic_id',
  'topic-hero-image': 'topic_id',
  'community-profile-image': 'community_id',
  'community-banner-image': 'community_id',
} as const

const TARGET_OWNER_SCHEMA = {
  post_id: postReferenceSchema,
  user_id: userReferenceSchema,
  user_profile_link_id: UUID_INPUT,
  topic_id: topicReferenceSchema,
  community_id: communityReferenceSchema,
} as const

const TARGET_INPUT = {
  anyOf: Object.entries(TARGET_OWNER_FIELDS).map(([surface, owner]) => ({
    type: 'object',
    properties: {
      surface: { type: 'string', enum: [surface] },
      [owner]: TARGET_OWNER_SCHEMA[owner],
      image_id: UUID_INPUT,
      target_url: text(2048),
    },
    required: ['surface', owner, 'image_id', 'target_url'],
    additionalProperties: false,
  })),
}

export const APPROVE_COPYRIGHT_EMAIL_INTAKE_DESCRIPTION =
  'Approve an email intake as a new notice. Read its raw email on the staff page; get_copyright_email_intake omits it. Recommendations are unchecked: supply claimant fields, hosted images and both true statutory declarations from the email. Send recommendation_id if used, otherwise manual_fallback_reason. All other fields are required. If the thread changed, refresh and retry manually.'

export const APPROVE_COPYRIGHT_EMAIL_INTAKE_PROPERTIES = {
  intake_id: UUID_INPUT,
  recommendation_id: nullable(UUID_INPUT),
  manual_fallback_reason: nullable(text(10_000)),
  jurisdiction: { type: 'string', enum: ['us_dmca'] },
  claimant_display_name: nullable(text(200)),
  claimant_contact: text(4096),
  claimant_email: text(254),
  work_description: text(50_000),
  has_good_faith_belief: { type: 'boolean' },
  has_accuracy_authority_under_penalty_of_perjury: { type: 'boolean' },
  electronic_signature: text(500),
  targets: { type: 'array', minItems: 1, maxItems: 20, items: TARGET_INPUT },
}

/**
 * Only the intake id is required by the tool schema. A missing claimant field or declaration is
 * left to the shared parsers, so it answers the same `422` and message as the REST route.
 */
export const APPROVE_COPYRIGHT_EMAIL_INTAKE_REQUIRED = ['intake_id']

export type ApproveCopyrightEmailIntakeArgs = {
  intake_id: string
  recommendation_id?: string | null
  manual_fallback_reason?: string | null
  jurisdiction: 'us_dmca'
  claimant_display_name: string | null
  claimant_contact: string
  claimant_email: string
  work_description: string
  has_good_faith_belief: boolean
  has_accuracy_authority_under_penalty_of_perjury: boolean
  electronic_signature: string
  targets: Array<Record<string, string>>
  rationale: string
}

/**
 * Runs the REST approval steps in the REST order (kill switch, field parsers, request contract) and
 * then the shared decision both surfaces call, so a caller's values win exactly as they do on REST.
 */
export async function approveCopyrightEmailIntakeFromToolArgs(
  currentUser: PrivateUser,
  args: ApproveCopyrightEmailIntakeArgs,
) {
  assertCopyrightIntakeEnabled()
  const targets = await Promise.all(
    args.targets.map(async target => {
      const owner = TARGET_OWNER_FIELDS[target.surface as keyof typeof TARGET_OWNER_FIELDS]
      if (!owner || owner === 'user_profile_link_id') return target
      const entityType =
        owner === 'post_id'
          ? 'post'
          : owner === 'user_id'
            ? 'user'
            : owner === 'topic_id'
              ? 'topic'
              : 'community'
      return { ...target, [owner]: await entityIdOrMissing(entityType, target[owner]!) }
    }),
  )
  const { intake_id: intakeId, ...body } = { ...args, targets }
  const input = parseCopyrightNoticeForm(body)
  const recommendationId = parseCopyrightRecommendationId(body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(body)
  validateCopyrightMcpConstructedRequest(
    APPROVE_COPYRIGHT_EMAIL_INTAKE_PATH,
    { id: intakeId },
    body,
  )
  return approveCopyrightEmailIntakeDecision(
    currentUser,
    intakeId,
    input,
    recommendationId,
    manualFallbackReason,
    body.rationale,
  )
}
