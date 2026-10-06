import { classifierPlanIsolatedCases } from './vitest-isolated-database-classifier-plan-cases.mts'
import { copyrightMcpIsolatedCases } from './vitest-isolated-database-copyright-mcp-cases.mts'
import { cursorIsolatedCases } from './vitest-isolated-database-cursor-cases.mts'
import { copyrightReportIsolatedCases } from './vitest-isolated-database-copyright-report-cases.mts'
import { generalIsolatedCases } from './vitest-isolated-database-general-cases.mts'
import { workerSweepIsolatedCases } from './vitest-isolated-database-worker-cases.mts'
type IsolatedDatabaseCaseDefinition = { file: string; fullName: `${string} > ${string}` }

const isolatedDatabaseCases = {
  ...copyrightReportIsolatedCases,
  ...workerSweepIsolatedCases,
  ...classifierPlanIsolatedCases,
  ...generalIsolatedCases,
  ...copyrightMcpIsolatedCases,
  ...cursorIsolatedCases,
} as const satisfies Record<string, IsolatedDatabaseCaseDefinition>
export type IsolatedDatabaseCaseId = keyof typeof isolatedDatabaseCases

type ChildEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'VITEST_ISOLATED_DATABASE_CASE'
    | 'VITEST_ISOLATED_DATABASE_CHILD'
    | 'DATABASE_URL'
    | 'READ_DATABASE_URL'
  >
>

const databaseNamePattern = /^voucha_scope_case_[0-9a-f]{24}$/

export function makeIsolatedDatabaseName(suffix: string): string {
  if (!/^[0-9a-f]{24}$/.test(suffix)) throw new Error('Invalid isolated database suffix')
  return `voucha_scope_case_${suffix}`
}

export function getIsolatedDatabaseCase(caseId: string) {
  if (!Object.hasOwn(isolatedDatabaseCases, caseId)) {
    throw new Error(`Unknown isolated database case: ${caseId}`)
  }
  return isolatedDatabaseCases[caseId as IsolatedDatabaseCaseId]
}

export function isolatedTestNamePattern(caseId: IsolatedDatabaseCaseId): string {
  const { fullName } = getIsolatedDatabaseCase(caseId)
  return `^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

export function getIsolatedDatabaseCaseMode(
  caseId: IsolatedDatabaseCaseId,
  env: ChildEnvironment = process.env,
): 'parent' | 'child' {
  getIsolatedDatabaseCase(caseId)
  const childCaseId = env.VITEST_ISOLATED_DATABASE_CASE
  const databaseName = env.VITEST_ISOLATED_DATABASE_CHILD
  if (!childCaseId && !databaseName) return 'parent'
  if (childCaseId !== caseId || !databaseName || !databaseNamePattern.test(databaseName)) {
    throw new Error(`Invalid isolated database child identity for ${caseId}`)
  }
  const databaseUrl = env.DATABASE_URL
  const readDatabaseUrl = env.READ_DATABASE_URL
  if (!databaseUrl || !readDatabaseUrl) {
    throw new Error(`Isolated database child ${caseId} needs both database URLs`)
  }
  const parsed = new URL(databaseUrl)
  const readParsed = new URL(readDatabaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.pathname !== `/${databaseName}` ||
    parsed.searchParams.has('dbname') ||
    parsed.searchParams.has('host') ||
    parsed.searchParams.has('hostaddr') ||
    readParsed.toString() !== parsed.toString()
  ) {
    throw new Error(`Isolated database child ${caseId} requires its exact disposable database`)
  }
  return 'child'
}

export function getIsolatedDatabaseChildCase(env: ChildEnvironment = process.env) {
  const caseId = env.VITEST_ISOLATED_DATABASE_CASE
  if (!caseId) throw new Error('Missing isolated database child case')
  const registeredCase = getIsolatedDatabaseCase(caseId)
  getIsolatedDatabaseCaseMode(caseId as IsolatedDatabaseCaseId, env)
  if (!env.VITEST_ISOLATED_DATABASE_CHILD) {
    throw new Error(`Isolated database child ${caseId} is missing its database marker`)
  }
  return registeredCase
}
