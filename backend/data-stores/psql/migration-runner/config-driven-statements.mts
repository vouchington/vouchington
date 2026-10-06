import { beginTransaction, type OwnedTransaction } from '../setup.mts'
import type { PoolClient, QueryExecutor } from '../types.mts'
import { splitSqlStatements } from './sql-statements.mts'

export async function runConfigDrivenStatementsInTransaction(
  sql: string,
  writer: QueryExecutor | undefined,
  lockTimeoutMs = 5_000,
  client?: PoolClient,
): Promise<void> {
  const statements = splitSqlStatements(sql)
  await runConfigDrivenStatementGroups(statements, lockTimeoutMs, writer, client)
}

async function runConfigDrivenStatementGroups(
  statements: readonly string[],
  lockTimeoutMs: number,
  writer?: QueryExecutor,
  client?: PoolClient,
): Promise<void> {
  let group: string[] = []

  async function runGroup(statementsToRun: readonly string[]): Promise<void> {
    // A borrowed migration-session client must own the transaction. An injected writer has no
    // client, so it only receives the statements and cannot open BEGIN/COMMIT/ROLLBACK itself.
    if (client) {
      await runConfigDrivenStatementsInNewTransaction(statementsToRun, lockTimeoutMs, client)
      return
    }
    if (writer) {
      await runConfigDrivenStatementsWithLocalLockTimeout(statementsToRun, writer, lockTimeoutMs)
      return
    }
    await runConfigDrivenStatementsInNewTransaction(statementsToRun, lockTimeoutMs)
  }

  async function flushGroup(): Promise<void> {
    if (group.length === 0) return
    const statementsToRun = group
    group = []
    await runGroup(statementsToRun)
  }

  async function runStatementAt(index: number): Promise<void> {
    const statement = statements[index]
    if (!statement) {
      await flushGroup()
      return
    }

    if (isConstraintValidationStatement(statement)) {
      await flushGroup()
      await runGroup([statement])
      return runStatementAt(index + 1)
    }

    group.push(statement)
    return runStatementAt(index + 1)
  }

  await runStatementAt(0)
}

async function runConfigDrivenStatementsInNewTransaction(
  statements: readonly string[],
  lockTimeoutMs: number,
  client?: PoolClient,
): Promise<void> {
  await using transaction = await beginTransaction(client ? { client } : {})
  await runAndCommitConfigDrivenStatements(statements, transaction, lockTimeoutMs)
}

async function runAndCommitConfigDrivenStatements(
  statements: readonly string[],
  transaction: OwnedTransaction,
  lockTimeoutMs: number,
): Promise<void> {
  await runConfigDrivenStatementsWithLocalLockTimeout(statements, transaction, lockTimeoutMs)
  await transaction.commit()
}

async function runConfigDrivenStatementsWithLocalLockTimeout(
  statements: readonly string[],
  doWrite: QueryExecutor,
  lockTimeoutMs: number,
): Promise<void> {
  await doWrite(buildLocalLockTimeoutStatement(lockTimeoutMs))
  await runConfigDrivenStatements(statements, doWrite)
}

async function runConfigDrivenStatements(
  statements: readonly string[],
  doWrite: QueryExecutor,
): Promise<void> {
  async function runStatementAt(index: number): Promise<void> {
    const statement = statements[index]
    if (!statement) return

    await doWrite(`/* runConfigDrivenStatements */ ${statement}`)
    await runStatementAt(index + 1)
  }

  await runStatementAt(0)
}

function isConstraintValidationStatement(statement: string): boolean {
  return /\bVALIDATE\s+CONSTRAINT\b/i.test(statement)
}

function buildLocalLockTimeoutStatement(lockTimeoutMs: number): string {
  return `/* runConfigDrivenStatementsInTransaction */ SET LOCAL lock_timeout = '${Math.round(lockTimeoutMs)}ms'`
}
