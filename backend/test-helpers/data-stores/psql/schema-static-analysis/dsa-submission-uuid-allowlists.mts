export const DSA_SUBMISSION_UUID_COLUMNS_WITHOUT_KEYS: readonly [string, string][] = [
  [
    'copyright_dsa_statement_submissions.lease_token',
    'Random worker claim fencing token, not a durable relation.',
  ],
  [
    'copyright_dsa_statement_submissions.transparency_database_uuid',
    'External Commission statement UUID returned by the DSA protocol; no local parent row exists.',
  ],
]
