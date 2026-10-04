import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import {
  copyrightPlacementPartiesSql,
  type CopyrightPlacementPartyPurpose,
} from '../services/copyright-notices/placement-parties.mts'
import {
  claimantCanViewCopyrightImagePlacement,
  type CopyrightImageSelector,
} from '../services/copyright-notices/placement-resolution.mts'

/** Reads the production policy fragment at its target-correlated database boundary. */
export async function readTestCopyrightPlacementParties(
  targetId: string,
  purpose: CopyrightPlacementPartyPurpose,
): Promise<string[]> {
  const statement = sql`/* readTestCopyrightPlacementParties */
    SELECT DISTINCT party.user_id
    FROM copyright_notice_targets target
    CROSS JOIN LATERAL `
  statement.append(copyrightPlacementPartiesSql(purpose))
  statement.append(sql` party WHERE target.id = ${targetId} AND party.user_id IS NOT NULL
    ORDER BY party.user_id`)
  const { rows } = await read<{ user_id: string }>(statement)
  return rows.map(row => row.user_id)
}

/** Exercises claimant visibility with the production query executor. */
export function testClaimantCanViewCopyrightImage(
  selector: CopyrightImageSelector,
  claimant: PrivateUser | null,
): Promise<boolean> {
  return claimantCanViewCopyrightImagePlacement(selector, claimant, write)
}
