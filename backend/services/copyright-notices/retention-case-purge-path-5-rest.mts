/** Remaining reviewed FK paths for group 5. */
export const COPYRIGHT_CASE_PURGE_PATH_5_REST = [
  [
    'notification_push_intent_subscription_receipts',
    [
      [
        'notifications',
        ['copyright_notice_id'],
        ['id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
      ],
      [
        'notification_push_intents',
        ['user_id', 'notification_id'],
        ['user_id', 'id'],
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id'],
      ],
      [
        'notification_push_intent_subscription_receipts',
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id', 'subscription_id'],
        ['user_id', 'notification_id', 'subscription_id'],
        ['subscription_id'],
      ],
    ],
    null,
  ],
  [
    'notification_push_intents',
    [
      [
        'notifications',
        ['copyright_notice_id'],
        ['id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
      ],
      [
        'notification_push_intents',
        ['user_id', 'notification_id'],
        ['user_id', 'id'],
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id'],
        ['user_id', 'notification_id'],
      ],
    ],
    null,
  ],
  [
    'notifications',
    [
      [
        'notifications',
        ['copyright_notice_id'],
        ['id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
        ['user_id', 'id'],
      ],
    ],
    null,
  ],
] as const
