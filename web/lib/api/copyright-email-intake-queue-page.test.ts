import { describe, expect, it } from 'vitest'
import {
  makeCopyrightEmailQueueItem,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { normalizeCopyrightEmailIntakeQueuePage } from './copyright-email-intake-queue-page'

describe('normalizeCopyrightEmailIntakeQueuePage', () => {
  it('keeps a paginated queue page unchanged', () => {
    const page = makeCopyrightEmailQueuePage([makeCopyrightEmailQueueItem()], {
      has_next_page: true,
      end_cursor: 'next',
    })

    expect(normalizeCopyrightEmailIntakeQueuePage(page)).toBe(page)
  })

  it('treats a response without page_info as the final page', () => {
    const items = [makeCopyrightEmailQueueItem()]

    expect(normalizeCopyrightEmailIntakeQueuePage({ copyright_email_intakes: items })).toEqual({
      copyright_email_intakes: items,
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })
})
