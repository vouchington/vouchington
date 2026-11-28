import { read } from '@data-stores/psql'

export type TableConstraintDefinition = {
  constraint_name: string
  definition: string
}

export async function getMembershipEntitlementEffectConstraints(): Promise<
  TableConstraintDefinition[]
> {
  const { rows } = await read<TableConstraintDefinition>(
    `/* getMembershipEntitlementEffectConstraints */
      SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'membership_entitlement_effects'::regclass
      ORDER BY conname`,
  )
  return rows
}
