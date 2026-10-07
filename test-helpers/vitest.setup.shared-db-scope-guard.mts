import { configureTestPostgresSessions } from './vitest-postgres-session-settings.mts'
import { installSharedDbScopeObserver } from './vitest-shared-db-scope-observer.mts'
import { rejectUnscopedSharedDbCall } from './vitest-shared-db-scope-violations.mts'

configureTestPostgresSessions()
installSharedDbScopeObserver(rejectUnscopedSharedDbCall)
