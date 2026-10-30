import {
  assertSafeSqlIdentifier,
  parseMonthlyPartitionName,
} from '@vouchington/postgres/partitions'
import type { PartitionDropPolicy } from '../config-driven/utils/partition-drop-policies.mts'
import type { QueryExecutor } from '../types.mts'
import { copyrightHistoryHoldProbe } from './copyright-history-hold-probe.mts'

export type PartitionDropRefusal =
  | 'no-declared-retention'
  | 'inside-retention'
  | 'legal-hold'
  | 'in-flight'
  | 'feedback-references-pending'
export type PartitionDropStatusReason = PartitionDropRefusal | 'check-pending'

export type PartitionDropCandidate = {
  table: string
  partition: string
  /** Exclusive upper bound of the partition's UUIDv7 key range. */
  upperBound: Date | null
}

export function getMonthlyPartitionUpperBound(table: string, partition: string): Date | null {
  const parsed = parseMonthlyPartitionName(partition)
  return parsed?.table === table ? new Date(Date.UTC(parsed.year, parsed.month, 1)) : null
}

export function getPartitionDropAgeRefusal(
  candidate: PartitionDropCandidate,
  policy: PartitionDropPolicy | undefined,
  referenceDate: Date,
): PartitionDropRefusal | null {
  const minimum = policy?.minimumRetentionDays
  const minimumMonths = policy?.minimumRetentionMonths
  if (!candidate.upperBound || !Number.isFinite(candidate.upperBound.getTime()))
    return 'no-declared-retention'
  if (!Number.isFinite(referenceDate.getTime())) return 'no-declared-retention'
  if (minimumMonths !== undefined) {
    if (!Number.isSafeInteger(minimumMonths) || minimumMonths < 0) return 'no-declared-retention'
    const cutoff = Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() - minimumMonths,
      1,
    )
    if (!Number.isFinite(cutoff)) return 'no-declared-retention'
    return candidate.upperBound.getTime() > cutoff ? 'inside-retention' : null
  }
  if (minimum == null || !Number.isFinite(minimum) || minimum < 0) return 'no-declared-retention'
  const cutoff = referenceDate.getTime() - minimum * 86_400_000
  return candidate.upperBound.getTime() > cutoff ? 'inside-retention' : null
}

/** Seek the first indexed account at or after each hold, then compare it outside LIMIT. */
function legalHoldAccountProbe(partition: string, column: string): string {
  return `SELECT 1 FROM user_legal_preservation_holds AS hold
    JOIN LATERAL (
      SELECT candidate_row.${column} AS held_account_user_id
      FROM ${partition} AS candidate_row
      WHERE candidate_row.${column} >= hold.account_user_id
      ORDER BY candidate_row.${column}, candidate_row.id
      LIMIT 1
    ) AS held_row ON held_row.held_account_user_id = hold.account_user_id
    WHERE hold.released_at IS NULL
    LIMIT 1`
}

/** One catalog-status round trip; each child contributes only index-backed LIMIT 1 probes. */
export async function getPartitionDropStatusRefusals(
  query: QueryExecutor,
  candidates: readonly PartitionDropCandidate[],
  policies: Readonly<Record<string, PartitionDropPolicy>>,
  referenceDate: Date,
  maxProbes: number,
): Promise<Map<string, PartitionDropStatusReason | null>> {
  if (!Number.isSafeInteger(maxProbes) || maxProbes <= 0) {
    throw new Error('maxProbes must be a positive safe integer')
  }
  const refusals = new Map<string, PartitionDropStatusReason | null>()
  const probes: string[] = []
  for (const candidate of candidates) {
    const policy = policies[candidate.table]
    const ageRefusal = getPartitionDropAgeRefusal(candidate, policy, referenceDate)
    if (ageRefusal) {
      refusals.set(candidate.partition, ageRefusal)
      continue
    }
    if (!policy) continue
    const partition = assertSafeSqlIdentifier(candidate.partition)
    const checks: string[] = []
    if (policy.legalHoldAccountColumn) {
      const column = assertSafeSqlIdentifier(policy.legalHoldAccountColumn)
      checks.push(`WHEN EXISTS (
        ${legalHoldAccountProbe(partition, column)}
      ) THEN 'legal-hold'`)
    }
    if (policy.copyrightHistory) {
      checks.push(`WHEN ${copyrightHistoryHoldProbe(candidate.table, partition)} THEN 'legal-hold'`)
    }
    const inFlightChecks = (policy.inFlightPredicates ?? []).map(
      predicate => `EXISTS (SELECT 1 FROM ${partition} WHERE ${predicate} LIMIT 1)`,
    )
    if (policy.mustBeEmpty) inFlightChecks.push(`EXISTS (SELECT 1 FROM ${partition} LIMIT 1)`)
    if (inFlightChecks.length > 0) {
      checks.push(`WHEN ${inFlightChecks.join(' OR ')} THEN 'in-flight'`)
    }
    if (checks.length === 0) {
      refusals.set(candidate.partition, null)
      continue
    }
    // The cleanup transaction always performs the full check; status stays bounded for large catalogs.
    if (probes.length >= maxProbes) {
      refusals.set(candidate.partition, 'check-pending')
      continue
    }
    probes.push(`SELECT '${partition}'::text AS partition_name,
      CASE ${checks.join(' ')} ELSE NULL END AS reason`)
  }
  if (probes.length === 0) return refusals
  const { rows } = await query(`/* getPartitionDropStatusRefusals */ ${probes.join(' UNION ALL ')}`)
  for (const row of rows) {
    refusals.set(row.partition_name as string, row.reason as PartitionDropRefusal | null)
  }
  return refusals
}

/** Evaluate with the partition locked by the caller before irreversible DDL. */
export async function getPartitionDropRefusal(
  query: QueryExecutor,
  candidate: PartitionDropCandidate,
  policy: PartitionDropPolicy | undefined,
  referenceDate: Date,
): Promise<PartitionDropRefusal | null> {
  const ageRefusal = getPartitionDropAgeRefusal(candidate, policy, referenceDate)
  if (ageRefusal) return ageRefusal
  if (!policy) return 'no-declared-retention'

  const partition = assertSafeSqlIdentifier(candidate.partition)
  if (policy.legalHoldAccountColumn) {
    const column = assertSafeSqlIdentifier(policy.legalHoldAccountColumn)
    const { rows } = await query(`/* getPartitionDropRefusal:legalHold */
      ${legalHoldAccountProbe(partition, column)}`)
    if (rows.length > 0) return 'legal-hold'
  }

  if (policy.copyrightHistory) {
    const { rows } = await query(`/* getPartitionDropRefusal:copyrightLegalHold */
      SELECT 1 WHERE ${copyrightHistoryHoldProbe(candidate.table, partition)}`)
    if (rows.length > 0) return 'legal-hold'
  }

  const inFlightPredicates = policy.inFlightPredicates ?? []
  async function hasInFlightAt(index: number): Promise<boolean> {
    const predicate = inFlightPredicates[index]
    if (!predicate) return false
    const { rows } = await query(`/* getPartitionDropRefusal:inFlight */
      SELECT 1 FROM ${partition} WHERE ${predicate} LIMIT 1`)
    return rows.length > 0 || hasInFlightAt(index + 1)
  }
  if (await hasInFlightAt(0)) return 'in-flight'
  if (policy.mustBeEmpty) {
    const { rows } = await query(`/* getPartitionDropRefusal:nonempty */
      SELECT 1 FROM ${partition} LIMIT 1`)
    if (rows.length > 0) return 'in-flight'
  }
  return null
}
