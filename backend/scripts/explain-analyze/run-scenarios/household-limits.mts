import { beginTransaction } from '@data-stores/psql'
import {
  assertCanAddHouseholdMember,
  assertCanCreateHousehold,
} from '@services/individuals-households/household-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const countQuery = '/* assertCanCreateHousehold */'
const memberQuery = '/* assertCanAddHouseholdMember */'

export async function runHouseholdLimitScenarios(): Promise<void> {
  registerScenarioContract('household-owner-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_households__owner_updated_id',
          'idx_household_members__individual_household',
        ],
        queryContains: countQuery,
      },
      { kind: 'maxProcessedRows', relation: 'households', max: 8 },
      { kind: 'maxProcessedRows', relation: 'household_members', max: 8 },
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
    ],
  })
  await runAndCapture(
    'household-owner-capacity',
    async () => {
      await using transaction = await beginTransaction()
      await assertCanCreateHousehold(seedUser.id, { query: transaction })
      await transaction.rollback()
    },
    undefined,
    [
      'assertCanCreateHousehold:lock',
      'assertCanCreateHousehold:individual',
      'assertCanCreateHousehold:lock-individual',
      'assertCanCreateHousehold',
    ],
  )

  registerScenarioContract('household-member-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_household_members__household_updated_id',
          'idx_household_members__individual_household',
          'idx_users__individual_id',
          'idx_households__owner_updated_id',
        ],
        queryContains: memberQuery,
      },
      { kind: 'maxProcessedRows', relation: 'households', max: 8 },
      { kind: 'maxProcessedRows', relation: 'household_members', max: 32 },
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
    ],
  })
  await runAndCapture(
    'household-member-capacity',
    async () => {
      await using transaction = await beginTransaction()
      await assertCanAddHouseholdMember(seedUser.id, seedUser.id, { query: transaction })
      await transaction.rollback()
    },
    undefined,
    [
      'assertCanAddHouseholdMember:lock-household',
      'assertCanAddHouseholdMember:lock-individual',
      'assertCanAddHouseholdMember',
    ],
  )
}
