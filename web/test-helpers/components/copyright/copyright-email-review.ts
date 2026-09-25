import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'

export const copyrightEmailIntakeId = '019f0000-0000-7000-8000-000000000001'

export function makeCopyrightEmailQueueItem(
  id = copyrightEmailIntakeId,
): CopyrightEmailIntakeQueueItem {
  return {
    id,
    received_at: '2026-09-19T00:00:00.000Z',
    parse_status: 'succeeded',
    recommendation_id: '019f0000-0000-7000-8000-000000000002',
    review_path: 'initial',
    linked_notice_id: null,
  }
}

export function makeCopyrightEmailQueuePage(
  items: CopyrightEmailIntakeQueueItem[] = [makeCopyrightEmailQueueItem()],
  pageInfo: Partial<CopyrightEmailIntakeQueuePage['page_info']> = {},
): CopyrightEmailIntakeQueuePage {
  return {
    copyright_email_intakes: items,
    page_info: {
      has_next_page: false,
      start_cursor: items.length > 0 ? 'start' : null,
      end_cursor: null,
      ...pageInfo,
    },
  }
}

export function makeCopyrightEmailIntake(id = copyrightEmailIntakeId) {
  return {
    id,
    received_at: '2026-09-19T00:00:00.000Z',
    review_path: 'initial' as const,
    linked_notice: null,
    raw_email: {
      mime_type: 'message/rfc822',
      byte_size: 1024,
      sha256: 'a'.repeat(64),
      download_url: `/api/v1/copyright-email-intakes/${id}/raw`,
    },
    parsed_email: {
      sender_email: 'tests+copyright-claimant@voucha.ai',
      subject: 'DMCA notice',
      body_text: 'Please remove the image.',
    },
    parser_error: null,
    recommendation: {
      id: '019f0000-0000-7000-8000-000000000002',
      structured_output: {
        claimant_name: 'Claimant',
        claimant_contact: 'tests+copyright-claimant@voucha.ai',
        claimant_email: 'tests+copyright-claimant@voucha.ai',
        work_description: 'Claimant photograph',
        good_faith_belief: true,
        accuracy_authority_under_penalty_of_perjury: true,
        electronic_signature: 'Claimant',
        target_urls: ['https://voucha.ai/discussion/example'],
        recommendation: 'potentially_valid',
      },
    },
  }
}

export function makeMatchedCopyrightEmailQueueItem(): CopyrightEmailIntakeQueueItem {
  return {
    ...makeCopyrightEmailQueueItem(),
    review_path: 'matched_thread',
    linked_notice_id: '019f0000-0000-7000-8000-000000000006',
  }
}

export function makeMatchedCopyrightEmailIntake() {
  return {
    ...makeCopyrightEmailIntake(),
    review_path: 'matched_thread' as const,
    linked_notice: {
      id: '019f0000-0000-7000-8000-000000000006',
      targets: [
        {
          id: '019f0000-0000-7000-8000-000000000005',
          placement_key: 'post-image:example',
        },
      ],
    },
  }
}
