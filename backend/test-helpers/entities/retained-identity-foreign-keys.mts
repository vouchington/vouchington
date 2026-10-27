import { read } from '@data-stores/psql'

export type RetainedIdentityForeignKey = { target: string; owner: string; column: string }

/** The identity-id column of each declared foreign key to a retained root or classifier bridge.
 * Composite provenance keys also include an uploader column; cleanup probes the identity id.
 * `conparentid = 0` keeps partition clones from counting as separate references. */
export async function readTestRetainedIdentityForeignKeys(): Promise<RetainedIdentityForeignKey[]> {
  const { rows } = await read<RetainedIdentityForeignKey>(`/* readRetainedIdentityRootForeignKeys */
    SELECT DISTINCT target.relname AS target, owner.relname AS owner, att.attname AS column
    FROM pg_constraint c
    JOIN pg_class owner ON owner.oid = c.conrelid
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = owner.relnamespace AND ns.nspname = 'public'
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(owner_attnum, target_attnum)
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.owner_attnum
    JOIN pg_attribute target_att ON target_att.attrelid = c.confrelid
      AND target_att.attnum = k.target_attnum AND target_att.attname = 'id'
    WHERE c.contype = 'f' AND c.conparentid = 0
      AND (target.relname ~ '^retained_[a-z_]+_identities$'
        OR target.relname = 'post_publication_community_identities')
    ORDER BY 1, 2, 3`)
  return rows
}
