import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { reviewCopyrightFormIntake } from '@services/copyright-notices'
import {
  rejectCopyrightEmailIntakeFromRecommendation,
  admitCopyrightEmailCorrespondenceFromRecommendation,
  rejectCopyrightEmailCorrespondenceFromRecommendation,
  replayCopyrightEmailIntakeReplyAndEnqueue,
} from '@services/copyright-notices/copyright-mcp-write-actions'
import {
  APPROVE_COPYRIGHT_EMAIL_INTAKE_DESCRIPTION,
  APPROVE_COPYRIGHT_EMAIL_INTAKE_PATH,
  APPROVE_COPYRIGHT_EMAIL_INTAKE_PROPERTIES,
  APPROVE_COPYRIGHT_EMAIL_INTAKE_REQUIRED,
  approveCopyrightEmailIntakeFromToolArgs,
  type ApproveCopyrightEmailIntakeArgs,
} from './copyright-decisions-approval.mts'
import { adminInput, createAdminTool, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'
export const RATIONALE_INPUT = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
  maxLength: 10_000,
} as const
const KINDS = ['supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold'] as const
type Kind = (typeof KINDS)[number]
type DecisionArgs = { rationale: string }
type DecisionConfig<T extends DecisionArgs> = {
  name: string
  description?: string
  path: string
  properties: Record<string, unknown>
  required: string[]
  idempotent: boolean
  destructive?: boolean
  run: (user: PrivateUser, args: T) => Promise<unknown>
}

export function copyrightDecisionTool<T extends DecisionArgs>(config: DecisionConfig<T>) {
  const api = { method: 'POST', path: config.path } as const
  return createAdminTool<T>({
    name: config.name,
    description:
      config.description ??
      `Record the staff copyright decision ${config.name.replaceAll('_', ' ')}.`,
    scope: 'copyright-notices:write',
    switch: 'copyright.mcpDecisionTools',
    auditRationale: true,
    api,
    parameters: adminInput({ ...config.properties, rationale: RATIONALE_INPUT }, [
      ...config.required,
      'rationale',
    ]),
    outputSchema: adminRouteOutputSchema(api),
    annotations: {
      readOnlyHint: false,
      destructiveHint: config.destructive ?? false,
      idempotentHint: config.idempotent,
      openWorldHint: false,
    },
    run: config.run,
  })
}

export function validateCopyrightDecisionRequest(
  path: string,
  pathValues: Record<string, string>,
  body?: Record<string, unknown>,
): void {
  const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(`POST:${path}`, {
    path: pathValues,
    ...(body ? { body } : {}),
  })
  assert(!error, 422, error?.message ?? 'Invalid copyright decision request')
}

const formReviewPath = '/api/v1/copyright-form-intakes/:id/reviews'
const rejectionPath = '/api/v1/copyright-email-intakes/:id/rejections'
const admitPath = '/api/v1/copyright-email-intakes/:id/correspondence'
const correspondenceRejectionPath = '/api/v1/copyright-email-intakes/:id/correspondence-rejections'
const replyReplayPath = '/api/v1/copyright-email-intakes/:id/reply/replays'

export const adminCopyrightDecisionIntakeTools = [
  copyrightDecisionTool<{
    id: string
    is_accepted: boolean
    rationale: string
  }>({
    name: 'review_copyright_form_intake',
    path: formReviewPath,
    properties: { id: UUID_INPUT, is_accepted: { type: 'boolean' } },
    required: ['id', 'is_accepted'],
    idempotent: true,
    run: async (user, args) => {
      const body = { is_accepted: args.is_accepted, rationale: args.rationale }
      validateCopyrightDecisionRequest(formReviewPath, { id: args.id }, body)
      const result = await reviewCopyrightFormIntake({
        intakeId: args.id,
        currentUser: user,
        ...body,
      })
      return {
        copyright_notice: { id: result.noticeId },
        copyright_submission: { id: result.submissionId },
        is_accepted: result.is_accepted,
      }
    },
  }),
  copyrightDecisionTool<ApproveCopyrightEmailIntakeArgs>({
    name: 'approve_copyright_email_intake',
    description: APPROVE_COPYRIGHT_EMAIL_INTAKE_DESCRIPTION,
    path: APPROVE_COPYRIGHT_EMAIL_INTAKE_PATH,
    properties: APPROVE_COPYRIGHT_EMAIL_INTAKE_PROPERTIES,
    required: APPROVE_COPYRIGHT_EMAIL_INTAKE_REQUIRED,
    idempotent: false,
    run: approveCopyrightEmailIntakeFromToolArgs,
  }),
  copyrightDecisionTool<{ intake_id: string; rationale: string }>({
    name: 'reject_copyright_email_intake',
    path: rejectionPath,
    properties: { intake_id: UUID_INPUT },
    required: ['intake_id'],
    idempotent: false,
    run: (user, args) =>
      rejectCopyrightEmailIntakeFromRecommendation(user, args.intake_id, args.rationale),
  }),
  copyrightDecisionTool<{
    intake_id: string
    kind: Kind
    target_ids?: string[]
    rationale: string
  }>({
    name: 'admit_copyright_email_correspondence',
    path: admitPath,
    properties: {
      intake_id: UUID_INPUT,
      kind: { type: 'string', enum: KINDS },
      target_ids: {
        type: 'array',
        items: UUID_INPUT,
        minItems: 1,
        maxItems: 20,
      },
    },
    required: ['intake_id', 'kind'],
    idempotent: true,
    run: (user, args) =>
      admitCopyrightEmailCorrespondenceFromRecommendation(
        user,
        args.intake_id,
        args.kind,
        args.target_ids ?? [],
        args.rationale,
      ),
  }),
  copyrightDecisionTool<{ intake_id: string; kind: Kind; rationale: string }>({
    name: 'reject_copyright_email_correspondence',
    path: correspondenceRejectionPath,
    properties: {
      intake_id: UUID_INPUT,
      kind: { type: 'string', enum: KINDS },
    },
    required: ['intake_id', 'kind'],
    idempotent: true,
    run: (user, args) =>
      rejectCopyrightEmailCorrespondenceFromRecommendation(
        user,
        args.intake_id,
        args.kind,
        args.rationale,
      ),
  }),
  copyrightDecisionTool<{ intake_id: string; rationale: string }>({
    name: 'replay_copyright_email_intake_reply',
    path: replyReplayPath,
    properties: { intake_id: UUID_INPUT },
    required: ['intake_id'],
    idempotent: true,
    run: (user, args) => {
      validateCopyrightDecisionRequest(replyReplayPath, { id: args.intake_id })
      return replayCopyrightEmailIntakeReplyAndEnqueue(user, args.intake_id)
    },
  }),
]
