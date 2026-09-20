/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const OAUTH_AUTHORIZATION_UUID_COLUMNS_WITHOUT_KEYS = [
  [
    'oauth_authorizations.exchange_claim_id',
    'Ephemeral fencing token rotated for each provider exchange claim; it intentionally identifies no durable relation.',
  ],
  [
    'oauth_authorizations.initiating_device_id',
    'Device JWT claim bound to completion; no devices table exists and the authorization is rejected when the caller claim differs.',
  ],
  [
    'oauth_authorizations.initiating_session_id',
    'Session JWT claim bound at authorization begin, including anonymous sessions that have no persisted user_sessions row.',
  ],
  [
    'oauth_authorizations.login_attempt_id',
    'Opaque MFA attempt identifier returned by the authentication flow; MFA attempt state is not a PostgreSQL relation.',
  ],
  [
    'oauth_authorizations.result_device_id',
    'Durable authenticated device-token claim; no devices table exists, and replay requires the exact stored claim.',
  ],
  [
    'oauth_authorizations.result_session_id',
    'Session identity is persisted before token issuance so a lost response remains recoverable; it intentionally cannot reference a user_sessions row that may not exist yet or may later be revoked.',
  ],
  [
    'oauth_authorization_server_events.client_id',
    'Immutable audit snapshot intentionally survives OAuth client deletion.',
  ],
  [
    'oauth_authorization_server_events.grant_id',
    'Immutable audit snapshot intentionally survives OAuth grant deletion.',
  ],
  [
    'oauth_authorization_server_events.user_id',
    'Immutable audit snapshot intentionally survives user deletion.',
  ],
] as const

export const AUTHORIZATION_TABLES_WITHOUT_CREATED_AT = [
  ['api_keys', 'Secret credentials use last-used/revoked timestamps instead of creation history.'],
  [
    'oauth_authorization_server_events',
    'Append-only audit events never update; their immutable occurrence time derives from the UUIDv7 id as occurred_at.',
  ],
] as const
/* v8 ignore stop */
