import * as psql from '@data-stores/psql'
import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import {
  afterNextPostgresCommitForTest as afterNextTargetCommit,
  afterPostgresTransactionQueryForTest as afterTargetTransactionQuery,
  beforePostgresTransactionQueryForTest as beforeTargetTransactionQuery,
  interceptPostgresTransactionsForTest as interceptTargetTransactions,
  rewritePostgresTransactionRowsForTest as rewriteTargetTransactionRows,
  type ManagedSqlTransaction,
  type TransactionBeginTarget,
} from 'vouchington-tooling/postgres-test-faults'

const rawTransactionTarget = psql.psql as unknown as TransactionBeginTarget
const ownedTransactionTarget = psql as unknown as TransactionBeginTarget

/**
 * Wrap transactions opened through `psql.psql.beginTransaction` (only the next one when `once`)
 * with `wrap`; returns the restore.
 */
export function interceptPostgresTransactionsForTest(
  wrap: (transaction: OwnedTransaction) => QueryExecutor,
  once = false,
): () => void {
  // Intercept before the application wrapper registers transaction ownership for commit actions.
  return interceptTargetTransactions(
    rawTransactionTarget,
    transaction =>
      wrap(transaction as unknown as OwnedTransaction) as unknown as ManagedSqlTransaction,
    once,
  )
}

/**
 * Rewrite the rows a default-pool transaction statement returns when its text contains `marker`
 * and its bound values satisfy `matchesValues`; the statement itself still runs. Use to make real
 * code observe state that cannot be stored, such as a row that vanished mid-run; returns the restore.
 */
export function rewritePostgresTransactionRowsForTest(
  marker: string,
  matchesValues: (values: readonly unknown[]) => boolean,
  rewrite: (rows: Record<string, unknown>[]) => Record<string, unknown>[],
): () => void {
  return rewriteTargetTransactionRows(rawTransactionTarget, marker, matchesValues, rewrite)
}

/**
 * Run `effect` right after the next default-pool transaction commits, then behave normally. Use to
 * change configuration or environment in the window between a claim and the work after it;
 * returns the restore.
 */
export function afterNextPostgresCommitForTest(effect: () => void): () => void {
  return afterNextTargetCommit(ownedTransactionTarget, effect)
}

/** Run an owned real effect after a matching SQL result was observed, without rewriting its rows. */
export function afterPostgresTransactionQueryForTest(
  marker: string,
  matchesValues: (values: readonly unknown[]) => boolean,
  effect: (transaction: QueryExecutor) => Promise<void>,
): () => void {
  return afterTargetTransactionQuery(rawTransactionTarget, marker, matchesValues, transaction =>
    effect(transaction as unknown as QueryExecutor),
  )
}

/** Run an owned real effect before a matching SQL statement is executed. */
export function beforePostgresTransactionQueryForTest(
  marker: string,
  matchesValues: (values: readonly unknown[]) => boolean,
  effect: () => Promise<void>,
): () => void {
  return beforeTargetTransactionQuery(rawTransactionTarget, marker, matchesValues, () => effect())
}
