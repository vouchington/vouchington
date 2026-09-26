import { installSharedDbScopeObserver } from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import { rejectUnscopedSharedDbCall } from './vitest-shared-db-scope-violations.mts'

installSharedDbScopeObserver(rejectUnscopedSharedDbCall)
