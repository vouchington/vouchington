import { createErrorCodeChecker, parseErrorDigest as parseDigest } from '@vouchington/api-client'
import type { MessageKey } from '@ts-shared/ui-messages'

type ErrorCopy = { title: MessageKey; description: MessageKey }

const STATUS_COPY: Record<number, ErrorCopy> = {
  400: {
    title: 'extracted.api.errorHelpers.badRequest_917ef22f',
    description: 'extracted.api.errorHelpers.theRequestWasInvalidPleaseTry_ac456788',
  },
  408: {
    title: 'extracted.api.errorHelpers.requestTimeout_70f60044',
    description: 'extracted.api.errorHelpers.theRequestTimedOutPleaseTry_e5893a0d',
  },
  409: {
    title: 'extracted.api.errorHelpers.conflict_014659ab',
    description: 'extracted.api.errorHelpers.thereWasAConflictWithYour_d6e84337',
  },
  410: {
    title: 'extracted.api.errorHelpers.gone_55f6a88d',
    description: 'extracted.api.errorHelpers.thisResourceIsNoLongerAvailable_fe97b81d',
  },
  422: {
    title: 'extracted.api.errorHelpers.invalidInput_c9bbbe83',
    description: 'extracted.api.errorHelpers.theRequestDataIsInvalidPlease_f6cdb2d2',
  },
  429: {
    title: 'extracted.api.errorHelpers.tooManyRequests_802600d1',
    description: 'extracted.api.errorHelpers.youReSendingRequestsTooQuickly_bae67614',
  },
}

const FALLBACK_COPY: ErrorCopy = {
  title: 'extracted.api.errorHelpers.somethingWentWrong_ab827e3f',
  description: 'extracted.api.errorHelpers.anErrorOccurredPleaseTryAgain_9c170dda',
}

/** Status-specific copy for `error.tsx` / `global-error.tsx` from an `ApiError` digest. */
export function parseErrorDigest(digest: string | undefined) {
  return parseDigest(digest, STATUS_COPY, FALLBACK_COPY)
}

const isCatalogedError = createErrorCodeChecker({ tagLimit: 'TAG_LIMIT_REACHED' })

/** Whether an error is a standing tag-add cap rejection, not a transient failure. */
export function isTagLimitError(error: unknown): boolean {
  return isCatalogedError(error, 'tagLimit')
}
