import { installSharedDbScopeObserver } from './vitest-shared-db-scope-observer.mts'
import { rejectUnscopedSharedDbCall } from './vitest-shared-db-scope-violations.mts'

installSharedDbScopeObserver(rejectUnscopedSharedDbCall)
