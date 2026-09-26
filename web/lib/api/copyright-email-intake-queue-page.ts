import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'

// Expand/contract: a backend deployed before queue pagination returns at most 100 intakes and no
// page_info. Drop the unpaginated arm once every live backend serves page_info.
export type CopyrightEmailIntakeQueueResponse =
  | CopyrightEmailIntakeQueuePage
  | { copyright_email_intakes: CopyrightEmailIntakeQueueItem[]; page_info?: undefined }

export function normalizeCopyrightEmailIntakeQueuePage(
  response: CopyrightEmailIntakeQueueResponse,
): CopyrightEmailIntakeQueuePage {
  return response.page_info
    ? response
    : {
        copyright_email_intakes: response.copyright_email_intakes,
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }
}
