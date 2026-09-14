import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type MembershipLedgerTableState = { exists: boolean; table_name: string }
export type MembershipIndex = { indexdef: string; indexname: string }
export type MembershipConstraint = {
  constraint_name: string
  definition: string
  table_name: string
}
export type MembershipAuditDeleteRule = { delete_rule: string; table_name: string }

export async function getMembershipLedgerTables(
  tableNames: string[],
): Promise<MembershipLedgerTableState[]> {
  const { rows } = await read<MembershipLedgerTableState>(
    `/* getMembershipLedgerTables */
    SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
    FROM unnest($1::text[]) AS table_name ORDER BY table_name COLLATE "C"`,
    [tableNames],
  )
  return rows
}

export async function getReplacedMembershipSkuTableState(): Promise<{ exists: boolean }[]> {
  const { rows } = await read<{ exists: boolean }>(`/* getReplacedMembershipSkuTable */
    SELECT to_regclass('public.membership_skus') IS NOT NULL AS exists`)
  return rows
}

export async function getMembershipLedgerPartialIndexes(
  indexNames: string[],
): Promise<MembershipIndex[]> {
  const { rows } = await read<MembershipIndex>(
    `/* getMembershipLedgerPartialIndexes */
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY($1::text[]) ORDER BY indexname`,
    [[indexNames]],
  )
  return rows
}

export async function getMembershipLineageImmutableTrigger(): Promise<{ enabled: string }[]> {
  const { rows } = await read<{ enabled: string }>(
    `SELECT tgenabled AS enabled FROM pg_trigger WHERE tgname = 'trigger_membership_provider_lineages_immutable'`,
  )
  return rows
}

export async function getMembershipProjectionLifecycleColumns(): Promise<
  { column_name: string }[]
> {
  const { rows } = await read<{ column_name: string }>(`/* getMembershipProjectionLifecycleColumn */
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memberships'
      AND column_name IN ('projection_ended_at', 'deleted_at') ORDER BY column_name`)
  return rows
}

export async function getMembershipCurrentProjectionIndexes(): Promise<{ indexdef: string }[]> {
  const { rows } = await read<{ indexdef: string }>(`/* getMembershipCurrentProjectionIndex */
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'memberships' AND indexname = 'idx_memberships__effective_user'`)
  return rows
}

export async function persistUnverifiedMembershipProviderEvidence(suffix: string): Promise<
  {
    id: string
    rejected_at: Date | null
    verified_at: Date | null
  }[]
> {
  const { rows } = await write<{
    id: string
    rejected_at: Date | null
    verified_at: Date | null
  }>(sql`/* persistMembershipProviderEvidenceBeforeVerification */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES ('stripe', 'test', ${`schema-evidence-${suffix}`},
      ${suffix.replaceAll('-', '').padEnd(64, '0')}, '\x01'::bytea)
    RETURNING id, verified_at, rejected_at`)
  return rows
}

export async function getMembershipLedgerBehaviorConstraints(
  tableNames: string[],
  constraintNames: string[],
): Promise<MembershipConstraint[]> {
  const { rows } = await read<MembershipConstraint>(
    `/* getMembershipLedgerBehaviorConstraints */
    SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = ANY($1::regclass[]) AND (conname = ANY($2::text[]) OR contype = 'c')
    ORDER BY table_name, constraint_name`,
    [[tableNames], [constraintNames]],
  )
  return rows
}

export async function getMembershipLedgerBehaviorIndexes(
  indexNames: string[],
): Promise<MembershipIndex[]> {
  const { rows } = await read<MembershipIndex>(
    `/* getMembershipLedgerBehaviorIndexes */
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY($1::text[]) ORDER BY indexname`,
    [[indexNames]],
  )
  return rows
}

export async function getMembershipLedgerAuditDeleteRules(
  tableNames: string[],
): Promise<MembershipAuditDeleteRule[]> {
  const { rows } = await read<MembershipAuditDeleteRule>(
    `/* getMembershipLedgerAuditDeleteRules */
    SELECT tc.table_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema AND rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = ANY($1::text[])
    ORDER BY tc.table_name, kcu.column_name`,
    [[tableNames]],
  )
  return rows
}

export async function getMembershipRenewalNotificationIdentity(): Promise<
  {
    foreign_column_name: string
    foreign_table_name: string
  }[]
> {
  const { rows } = await read<{
    foreign_column_name: string
    foreign_table_name: string
  }>(`/* getMembershipRenewalNotificationIdentity */
    SELECT ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    INNER JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
    INNER JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_schema = 'public' AND tc.table_name = 'memberships' AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'renewal_price_increase_notified_observation_id'`)
  return rows
}
