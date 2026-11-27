import { configureTestPostgresSessions } from 'vouchington-tooling/shared-db-scope-guard'
import { VOUCHA_TEST_POSTGRES_SESSION_OPTIONS } from './vitest-shared-db-scope-guard.mts'

configureTestPostgresSessions(process.env, VOUCHA_TEST_POSTGRES_SESSION_OPTIONS)
