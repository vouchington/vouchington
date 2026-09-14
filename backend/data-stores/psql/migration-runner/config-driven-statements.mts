import { beginTransaction, type OwnedTransaction } from '../setup.mts'
import onError from '@modules/on-error'
import type { QueryExecutor } from '../types.mts'
import { splitSqlStatements } from './sql-statements.mts'

export async function runConfigDrivenStatementsInTransaction(
  sql: string,
  writer: QueryExecutor | undefined,
  lockTimeoutMs = 5_000,
): Promise<void> {
  const statements = splitSqlStatements(sql)

  if (writer) {
    await runConfigDrivenStatementGroups(statements, lockTimeoutMs, writer)
    return
  }

  await runConfigDrivenStatementGroups(statements, lockTimeoutMs)
}

async function runConfigDrivenStatementGroups(
  statements: readonly string[],
  lockTimeoutMs: number,
  writer?: QueryExecutor,
): Promise<void> {
  let group: string[] = []

  async function flushGroup(): Promise<void> {
    if (group.length === 0) return
    const statementsToRun = group
    group = []
    if (writer) {
      await runConfigDrivenStatementsWithWriterTransaction(statementsToRun, writer, lockTimeoutMs)
    } else {
      await runConfigDrivenStatementsInNewTransaction(statementsToRun, lockTimeoutMs)
    }
  }

  async function runStatementAt(index: number): Promise<void> {
    const statement = statements[index]
    if (!statement) {
      await flushGroup()
      return
    }

    if (isConstraintValidationStatement(statement)) {
      await flushGroup()
      if (writer) {
        await runConfigDrivenStatementsWithWriterTransaction([statement], writer, lockTimeoutMs)
      } else {
        await runConfigDrivenStatementsInNewTransaction([statement], lockTimeoutMs)
      }
      return runStatementAt(index + 1)
    }

    group.push(statement)
    return runStatementAt(index + 1)
  }

  await runStatementAt(0)
}

async function runConfigDrivenStatementsWithWriterTransaction(
  statements: readonly string[],
  writer: QueryExecutor,
  lockTimeoutMs: number,
): Promise<void> {
  await writer('/* runConfigDrivenStatementsInTransaction */ BEGIN')
  try {
    await runConfigDrivenStatementsWithLocalLockTimeout(statements, writer, lockTimeoutMs)
    await writer('/* runConfigDrivenStatementsInTransaction */ COMMIT')
  } catch (error) {
    await writer('/* runConfigDrivenStatementsInTransaction */ ROLLBACK').catch(onError)
    throw error
  }
}

async function runConfigDrivenStatementsInNewTransaction(
  statements: readonly string[],
  lockTimeoutMs: number,
): Promise<void> {
  await using transaction = await beginTransaction()
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
