import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import {
  copyrightStaffEmailIntakeQueueCursorScope,
  searchCopyrightStaffEmailIntakes,
} from './read-models-staff-email-intakes.mts'

export const copyrightEmailIntakeQueueParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

export async function listCopyrightStaffEmailIntakePage(
  currentUser: PrivateUser,
  args: { after?: string; limit: number },
) {
  const after = args.after
    ? decodeScopedPreciseTimestampCursor(
        args.after,
        copyrightStaffEmailIntakeQueueCursorScope,
        'Invalid copyright email intake queue cursor',
      )
    : undefined
  const { intakes, hasNextPage } = await searchCopyrightStaffEmailIntakes(currentUser, {
    limit: args.limit,
    after,
  })
  const cursorFor = (intake: (typeof intakes)[number]) =>
    encodeScopedPreciseTimestampCursor(
      intake.cursor_received_at,
      intake.id,
      copyrightStaffEmailIntakeQueueCursorScope,
    )
  const lastIntake = intakes.at(-1)
  return {
    copyright_email_intakes: intakes.map(({ cursor_received_at: _, ...intake }) => intake),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: intakes[0] ? cursorFor(intakes[0]) : null,
      end_cursor: hasNextPage && lastIntake ? cursorFor(lastIntake) : null,
    },
  }
}
