import { read } from '@data-stores/psql'

export type RetainedIdentityForeignKey = {
  owner: string
  target: string
  delete_action: string
}

export async function readRetainedIdentityLiveForeignKeys(): Promise<RetainedIdentityForeignKey[]> {
  const { rows } = await read<RetainedIdentityForeignKey>(
    `/* readRetainedIdentityLiveForeignKeys */
      SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
        confdeltype::text AS delete_action
      FROM pg_constraint WHERE contype = 'f' AND conrelid IN
        ('users'::regclass, 'api_keys'::regclass, 'topics'::regclass, 'posts'::regclass,
         'rss_feed_items'::regclass, 'memberships'::regclass)`,
  )
  return rows
}

export async function readRetainedRelationForeignKeys(): Promise<RetainedIdentityForeignKey[]> {
  const { rows } = await read<RetainedIdentityForeignKey>(
    `/* readRetainedRelationForeignKeys */
      SELECT conrelid::regclass::text AS owner, confrelid::regclass::text AS target,
        confdeltype::text AS delete_action
      FROM pg_constraint
      WHERE contype = 'f' AND conrelid::regclass::text LIKE 'retained_relation__%'`,
  )
  return rows
}

export type RetainedRelationImpactForeignKey = {
  column_name: string
  target: string
}

export async function readRetainedRelationImpactForeignKeys(): Promise<
  RetainedRelationImpactForeignKey[]
> {
  const { rows } = await read<RetainedRelationImpactForeignKey>(
    `/* readRetainedRelationImpactForeignKeys */
      SELECT a.attname AS column_name, c.confrelid::regclass::text AS target
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[2]
      WHERE c.contype = 'f' AND c.conrelid = 'user_deletion_relation_impacts'::regclass
        AND array_length(c.conkey, 1) = 2`,
  )
  return rows
}
