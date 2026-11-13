/** Remaining reviewed FK paths for group 1. */
export const COPYRIGHT_CASE_PURGE_PATH_1_REST = [
  [
    'copyright_notice_action_attempts',
    [
      [
        'copyright_notice_action_work_items',
        ['copyright_notice_id'],
        ['id'],
        ['id'],
        ['id'],
        ['id'],
      ],
      [
        'copyright_notice_action_attempts',
        ['work_item_id'],
        ['id'],
        ['id'],
        ['id', 'attempt_number'],
        ['attempt_number'],
      ],
    ],
    null,
  ],
  [
    'copyright_notice_appeal_reviews',
    [
      ['copyright_notice_submissions', ['copyright_notice_id'], ['id'], ['id'], ['id'], ['id']],
      [
        'copyright_notice_appeal_reviews',
        ['copyright_notice_submission_id'],
        ['id'],
        ['id'],
        ['id', 'copyright_restriction_id'],
        ['copyright_restriction_id'],
      ],
    ],
    null,
  ],
  [
    'copyright_notice_appeal_recommendations',
    [
      ['copyright_notice_submissions', ['copyright_notice_id'], ['id'], ['id'], ['id'], ['id']],
      [
        'copyright_notice_appeal_recommendations',
        ['copyright_notice_submission_id'],
        ['id'],
        ['id'],
        ['id'],
        ['id'],
      ],
    ],
    null,
  ],
] as const
