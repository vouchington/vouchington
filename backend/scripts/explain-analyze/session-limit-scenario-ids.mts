export const SESSION_LIMIT_SCENARIO_IDS = [
  'session-limit-hasAuthenticatedSession',
  'session-limit-hasAuthenticatedSession-missing',
  'session-limit-findActiveSessionsForLimit',
  'session-limit-revokeOldestAuthenticatedSessions',
  'session-limit-revoke-all',
  'session-limit-revoke-other',
  'session-limit-list-active',
  'session-limit-list-active-cursor',
] as const
