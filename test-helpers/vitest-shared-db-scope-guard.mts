import type { SharedDbScopeEvent as PlatformScopeEvent } from '@vouchington/postgres/query-telemetry'
import {
  createSharedDbScopeGuard,
  FAST_TEST_STATEMENT_TIMEOUT_MS,
  getSharedOwnedKeysetReadPolicy,
  MAX_TEST_STATEMENT_TIMEOUT_MS,
  MIN_TEST_STATEMENT_TIMEOUT_MS,
  type TestPostgresSessionOptions,
} from 'vouchington-tooling/shared-db-scope-guard'
import type {
  SharedDbOwnedKeysetRead,
  SharedDbScopeOperation,
} from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import type { QueryExecutor } from '../backend/data-stores/psql/types.mts'
import { TEST_HNSW_EF_SEARCH } from '../backend/test-helpers/vector-search-recall-constant.mts'

export const VOUCHA_SHARED_DB_NAME = 'voucha'

export type SharedDbScopeEvent = PlatformScopeEvent<
  SharedDbScopeOperation,
  string,
  SharedDbOwnedKeysetRead
>

export const VOUCHA_TEST_POSTGRES_SESSION_OPTIONS: TestPostgresSessionOptions = {
  envKeys: ['DATABASE_URL', 'READ_DATABASE_URL'],
  statementTimeoutEnvVar: 'PG_TEST_STATEMENT_TIMEOUT_MS',
  statementTimeoutBounds: {
    defaultMs: FAST_TEST_STATEMENT_TIMEOUT_MS,
    minMs: MIN_TEST_STATEMENT_TIMEOUT_MS,
    maxMs: MAX_TEST_STATEMENT_TIMEOUT_MS,
  },
  extraSettings: {
    'hnsw.ef_search': TEST_HNSW_EF_SEARCH,
  },
}

export const ownedEmailQueueKeysetPolicy = getSharedOwnedKeysetReadPolicy<SharedDbScopeOperation>({
  database: VOUCHA_SHARED_DB_NAME,
  operation: 'searchCopyrightStaffEmailIntakes',
  table: 'copyright_notice_email_intakes',
  limit: 1,
  sqlLimit: 2,
})

export const sharedDbScopeGuard = createSharedDbScopeGuard<
  SharedDbScopeOperation,
  string,
  SharedDbOwnedKeysetRead,
  QueryExecutor
>({
  database: VOUCHA_SHARED_DB_NAME,
  idsOnlyOperations: ['searchCopyrightStaffEmailIntakes', 'listAvailableNotificationPushIntents'],
  reservableOperations: [
    {
      operation: 'cleanupRetainedRelationIdentities',
      table: 'retained_relation_identity_cleanup_cursors',
    },
  ],
  policies: [ownedEmailQueueKeysetPolicy],
  requiredScopeDescription: event =>
    event.operation === 'searchCopyrightStaffEmailIntakes'
      ? 'fixture IDs or a proven owned keyset'
      : undefined,
})
