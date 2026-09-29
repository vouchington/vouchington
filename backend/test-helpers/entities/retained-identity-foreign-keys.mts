import { read } from '@data-stores/psql'

export type RetainedIdentityForeignKey = { target: string; owner: string; column: string }

/** Every declared foreign key that targets a retained identity root. `conparentid = 0` keeps each
 * declared foreign key once, because partition clones are not separate references. */
export async function readTestRetainedIdentityForeignKeys(): Promise<RetainedIdentityForeignKey[]> {
  const { rows } = await read<RetainedIdentityForeignKey>(`/* readRetainedIdentityRootForeignKeys */
    SELECT DISTINCT target.relname AS target, owner.relname AS owner, att.attname AS column
    FROM pg_constraint c
    JOIN pg_class owner ON owner.oid = c.conrelid
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = owner.relnamespace AND ns.nspname = 'public'
    CROSS JOIN LATERAL unnest(c.conkey) AS k(attnum)
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
    WHERE c.contype = 'f' AND c.conparentid = 0 AND target.relname ~ '^retained_[a-z_]+_identities$'
    ORDER BY 1, 2, 3`)
  return rows
}
