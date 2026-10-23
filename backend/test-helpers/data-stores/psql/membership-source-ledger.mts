import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
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
    allowUnannotatedQuery(
      `SELECT tgenabled AS enabled FROM pg_trigger WHERE tgname = 'trigger_membership_provider_lineages_immutable'`,
    ),
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
      membership_provider_context_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${`schema-evidence-${suffix}`}),
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
    SELECT child.relname AS table_name,
      CASE conf.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS delete_rule
    FROM pg_constraint conf
    JOIN pg_class child ON child.oid = conf.conrelid
    JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
    JOIN LATERAL unnest(conf.conkey) AS column_number(attnum) ON true
    JOIN pg_attribute attribute
      ON attribute.attrelid = child.oid AND attribute.attnum = column_number.attnum
    WHERE conf.contype = 'f'
      AND namespace.nspname = 'public'
      AND child.relname = ANY($1::text[])
    ORDER BY child.relname, attribute.attname`,
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
    SELECT foreign_table.relname::text AS foreign_table_name,
      foreign_attribute.attname::text AS foreign_column_name
    FROM pg_constraint constraint_row
    JOIN pg_class foreign_table ON foreign_table.oid = constraint_row.confrelid
    JOIN LATERAL generate_subscripts(constraint_row.conkey, 1) AS key_index(index_number) ON true
    JOIN pg_attribute local_attribute
      ON local_attribute.attrelid = constraint_row.conrelid
      AND local_attribute.attnum = constraint_row.conkey[key_index.index_number]
    JOIN pg_attribute foreign_attribute
      ON foreign_attribute.attrelid = constraint_row.confrelid
      AND foreign_attribute.attnum = constraint_row.confkey[key_index.index_number]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.conrelid = 'public.membership_renewal_price_increase_notification_work_items'::regclass
      AND local_attribute.attname = 'membership_provider_observation_id'`)
  return rows
}
