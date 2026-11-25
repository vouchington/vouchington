import { createSharedDbScopeGuardRunner } from 'vouchington-tooling/shared-db-scope-guard'
import { VOUCHA_SHARED_DB_NAME } from './vitest-shared-db-scope-guard.mts'

export default createSharedDbScopeGuardRunner({ database: VOUCHA_SHARED_DB_NAME })
