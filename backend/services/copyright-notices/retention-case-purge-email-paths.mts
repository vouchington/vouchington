import type { Edge, Phase } from './retention-case-purge-child-path.mts'

const link: Edge = [
  'copyright_notice_email_intake_notice_links',
  ['copyright_notice_id'],
  ['id'],
  ['id'],
  ['id', 'copyright_notice_email_intake_id'],
  ['id'],
]

function intakeChild(table: string, fkColumn: string): Phase {
  return [
    table,
    [link, [table, [fkColumn], ['copyright_notice_email_intake_id'], ['id'], ['id'], ['id']]],
    null,
  ]
}

function receiptDeliveryChild(table: string, fkColumn: string): Phase {
  const work: Edge = [
    'copyright_notice_delivery_work_items',
    ['copyright_notice_email_intake_receipt_id'],
    ['copyright_notice_email_intake_id'],
    ['id'],
    ['id'],
    ['id'],
  ]
  return [table, [link, work, [table, [fkColumn], ['id'], ['id'], ['id'], ['id']]], null]
}

const attempt: Edge = [
  'copyright_notice_delivery_attempts',
  ['work_item_id'],
  ['id'],
  ['id'],
  ['id'],
  ['id'],
]

/** Exclusive linked-intake ciphertext branches, after case-owned correspondence is drained. */
export const COPYRIGHT_CASE_EMAIL_PRIVATE_PATHS: readonly Phase[] = [
  [
    'copyright_notice_delivery_attempt_results',
    [
      link,
      [
        'copyright_notice_delivery_work_items',
        ['copyright_notice_email_intake_receipt_id'],
        ['copyright_notice_email_intake_id'],
        ['id'],
        ['id'],
        ['id'],
      ],
      attempt,
      [
        'copyright_notice_delivery_attempt_results',
        ['attempt_id'],
        ['id'],
        ['attempt_id'],
        ['attempt_id'],
        ['attempt_id'],
      ],
    ],
    null,
  ],
  receiptDeliveryChild('copyright_notice_delivery_attempts', 'work_item_id'),
  receiptDeliveryChild(
    'copyright_notice_delivery_recipients',
    'copyright_notice_delivery_work_item_id',
  ),
  intakeChild('copyright_notice_delivery_work_items', 'copyright_notice_email_intake_receipt_id'),
  intakeChild('copyright_notice_email_intake_attachments', 'copyright_notice_email_intake_id'),
  intakeChild('copyright_notice_email_intake_parses', 'copyright_notice_email_intake_id'),
  intakeChild('copyright_notice_email_thread_references', 'copyright_notice_email_intake_id'),
  intakeChild('copyright_decision_rationales', 'copyright_notice_email_intake_receipt_id'),
  intakeChild('copyright_notice_email_intake_reviews', 'copyright_notice_email_intake_receipt_id'),
  intakeChild(
    'copyright_notice_email_intake_recommendations',
    'copyright_notice_email_intake_receipt_id',
  ),
  intakeChild(
    'copyright_notice_email_intake_recommendation_identities',
    'copyright_notice_email_intake_receipt_id',
  ),
]

/** Link removal follows private intake children and precedes correspondence rows it references. */
export const COPYRIGHT_CASE_EMAIL_LINK_PHASE: Phase = [
  'copyright_notice_email_intake_notice_links',
  [link],
  "link_kind = 'thread'",
]
