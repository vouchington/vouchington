import {
  appendCopyrightLegalHoldAssessment,
  completeCopyrightMandatoryHumanReview,
  resolveCopyrightLegalHold,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
} from '@services/copyright-notices'
import {
  parseCopyrightAppealDecisionInput,
  parseCopyrightLegalHoldAssessmentInput,
} from '@services/copyright-notices/copyright-mcp-write-actions'
import { UUID_INPUT } from './create-admin-tool.mts'
import {
  copyrightDecisionTool,
  validateCopyrightDecisionRequest,
} from './copyright-decisions-intake.mts'

import {
  APPEAL_PROPERTIES,
  HOLD_PROPERTIES,
  copyrightAppealBody,
  copyrightHoldBody,
  type AppealArgs,
  type HoldArgs,
} from './copyright-decisions-case-input.mts'

type Action = 'confirm' | 'reverse'

const restrictionPath = '/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews'
const counterPath = '/api/v1/copyright-submissions/:id/counter-notice-reviews'
const appealPath = '/api/v1/copyright-submissions/:id/appeal-reviews'
const assessmentPath = '/api/v1/copyright-submissions/:id/legal-hold-assessments'
const resolutionPath = '/api/v1/copyright-legal-hold-assessments/:id/resolutions'

export const adminCopyrightDecisionCaseTools = [
  copyrightDecisionTool<{
    id: string
    restrictionId: string
    action: Action
    rationale: string
  }>({
    name: 'review_copyright_restriction',
    path: restrictionPath,
    properties: {
      id: UUID_INPUT,
      restrictionId: UUID_INPUT,
      action: { type: 'string', enum: ['confirm', 'reverse'] },
    },
    required: ['id', 'restrictionId', 'action'],
    idempotent: false,
    destructive: true,
    run: async (user, args) => {
      const body = { action: args.action, rationale: args.rationale }
      validateCopyrightDecisionRequest(
        restrictionPath,
        { id: args.id, restrictionId: args.restrictionId },
        body,
      )
      return {
        copyright_restriction: await completeCopyrightMandatoryHumanReview({
          currentUser: user,
          noticeId: args.id,
          restrictionId: args.restrictionId,
          ...body,
          reviewedAt: new Date(),
        }),
      }
    },
  }),
  copyrightDecisionTool<{
    id: string
    is_accepted: boolean
    rationale: string
  }>({
    name: 'review_copyright_counter_notice',
    path: counterPath,
    properties: { id: UUID_INPUT, is_accepted: { type: 'boolean' } },
    required: ['id', 'is_accepted'],
    idempotent: false,
    run: async (user, args) => {
      const body = { is_accepted: args.is_accepted, rationale: args.rationale }
      validateCopyrightDecisionRequest(counterPath, { id: args.id }, body)
      const result = await reviewCopyrightCounterNotice({
        submissionId: args.id,
        currentUser: user,
        ...body,
      })
      return {
        copyright_notice: { id: result.noticeId },
        assessment_id: result.assessmentId,
        deadline_id: result.deadlineId,
      }
    },
  }),
  copyrightDecisionTool<AppealArgs>({
    name: 'review_copyright_appeal',
    path: appealPath,
    properties: APPEAL_PROPERTIES,
    required: ['id', 'decisions'],
    idempotent: false,
    destructive: true,
    run: async (user, args) => {
      const body = copyrightAppealBody(args)
      validateCopyrightDecisionRequest(appealPath, { id: args.id }, body)
      const parsed = parseCopyrightAppealDecisionInput(body)
      const result = await reviewCopyrightAppeal({
        submissionId: args.id,
        currentUser: user,
        rationale: args.rationale,
        ...parsed,
      })
      return {
        copyright_notice: { id: result.noticeId },
        review_ids: result.reviewIds,
      }
    },
  }),
  copyrightDecisionTool<HoldArgs>({
    name: 'assess_copyright_legal_hold',
    path: assessmentPath,
    properties: HOLD_PROPERTIES,
    required: ['id', 'is_from_original_claimant', 'is_same_material', 'target_ids'],
    idempotent: false,
    destructive: true,
    run: async (user, args) => {
      const body = copyrightHoldBody(args)
      validateCopyrightDecisionRequest(assessmentPath, { id: args.id }, body)
      const parsed = parseCopyrightLegalHoldAssessmentInput(body)
      return {
        copyright_legal_hold_assessment: await appendCopyrightLegalHoldAssessment({
          currentUser: user,
          submissionId: args.id,
          assessedAt: new Date(),
          fromOriginalClaimant: args.is_from_original_claimant,
          sameMaterial: args.is_same_material,
          rationale: args.rationale,
          ...parsed,
        }),
      }
    },
  }),
  copyrightDecisionTool<{
    id: string
    resolution_kind: 'dismissed' | 'proceeding_ended' | 'superseded'
    rationale: string
  }>({
    name: 'resolve_copyright_legal_hold',
    path: resolutionPath,
    properties: {
      id: UUID_INPUT,
      resolution_kind: {
        type: 'string',
        enum: ['dismissed', 'proceeding_ended', 'superseded'],
      },
    },
    required: ['id', 'resolution_kind'],
    idempotent: false,
    destructive: true,
    run: async (user, args) => {
      const body = {
        resolution_kind: args.resolution_kind,
        rationale: args.rationale,
      }
      validateCopyrightDecisionRequest(resolutionPath, { id: args.id }, body)
      return {
        copyright_legal_hold_resolution: await resolveCopyrightLegalHold({
          currentUser: user,
          assessmentId: args.id,
          resolvedAt: new Date(),
          resolutionKind: args.resolution_kind,
          rationale: args.rationale,
        }),
      }
    },
  }),
]
