import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { createReportInputParser, ReportValidationError } from '@vouchington/utils/moderation'
import {
  MODERATION_REPORT_ENTITY_TYPES,
  MODERATION_REPORT_REASONS,
  type ModerationReportEntityType,
  type ModerationReportReason,
} from './config.mts'

export interface CreateModerationReportInput {
  entityType: ModerationReportEntityType
  entityId: string
  reason: ModerationReportReason
  note: string | null
}

const reportInputParser = createReportInputParser<
  ModerationReportEntityType,
  string,
  ModerationReportReason
>({
  targetTypes: MODERATION_REPORT_ENTITY_TYPES,
  reasons: MODERATION_REPORT_REASONS,
  parseTargetId(value) {
    return isUUID(value) ? value : null
  },
  maxNoteLength: 1000,
})

export function parseCreateModerationReportInput(raw: {
  entityType?: unknown
  entityId?: unknown
  reason?: unknown
  note?: unknown
}): CreateModerationReportInput {
  try {
    // The existing API reports this product-policy error before validating the optional note.
    // Keep that precedence while the generic parser owns the remaining validation sequence.
    if (
      typeof raw.entityType === 'string' &&
      (MODERATION_REPORT_ENTITY_TYPES as readonly string[]).includes(raw.entityType) &&
      typeof raw.entityId === 'string' &&
      isUUID(raw.entityId) &&
      raw.reason === 'vote_manipulation' &&
      raw.entityType !== 'post'
    ) {
      throw new ReportValidationError(
        'invalid_reason',
        'vote_manipulation reason is only valid for posts',
      )
    }

    const draft = reportInputParser.parse({
      targetType: raw.entityType,
      targetId: raw.entityId,
      reason: raw.reason,
      note: raw.note,
    })

    return {
      entityType: draft.target.type,
      entityId: draft.target.id,
      reason: draft.reason,
      note: draft.note,
    }
  } catch (error) {
    if (error instanceof ReportValidationError) {
      throw createHttpError(422, reportValidationMessage(error))
    }
    throw error
  }
}

function reportValidationMessage(error: ReportValidationError): string {
  if (
    error.code === 'invalid_reason' &&
    error.message === 'vote_manipulation reason is only valid for posts'
  ) {
    return error.message
  }

  switch (error.code) {
    case 'invalid_target_type':
      return 'Invalid entity type'
    case 'invalid_target_identifier':
      return 'Invalid entity ID'
    case 'invalid_reason':
      return 'Invalid reason'
    case 'invalid_note':
      return 'Invalid note'
    case 'note_too_long':
      return 'Note must be 1000 characters or fewer'
  }
}
