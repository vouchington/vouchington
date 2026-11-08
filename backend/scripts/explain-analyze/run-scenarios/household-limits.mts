import { getOrCreateIndividual } from '@services/individuals-households/individuals/individuals'
import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  assertCanAddHouseholdMember,
  assertCanCreateHousehold,
} from '@services/individuals-households/household-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const countQuery = '/* assertCanCreateHousehold */'
const memberQuery = '/* assertCanAddHouseholdMember */'

export async function runHouseholdLimitScenarios(): Promise<void> {
  registerScenarioContract('household-individual-bind', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['users_pkey'] },
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
      { kind: 'maxProcessedRows', relation: 'individuals', max: 4 },
    ],
  })
  await runAndCapture(
    'household-individual-bind',
    async () => {
      await using transaction = await beginTransaction()
      await transaction(
        '/* householdIndividualBindFixture */ UPDATE users SET individual_id = NULL WHERE id = $1::uuid',
        [seedUser.id],
      )
      const individual = await getOrCreateIndividual(seedUser, { query: transaction })
      assert.ok(individual?.id)
      await transaction.rollback()
    },
    undefined,
    ['getIndividual', 'lockHouseholdOwnerAdmission', 'createRepresentativeIndividual'],
  )

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
      // The explain seed already owns the signup household and one spending household.
      await assert.rejects(() => assertCanCreateHousehold(seedUser.id, { query: transaction }), {
        code: 'HOUSEHOLD_LIMIT_REACHED',
      })
      await transaction.rollback()
    },
    undefined,
    [
      'lockHouseholdOwnerAdmission',
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
      // Household tag 20 and individual tag 1b are the seeded owner row and its member.
      await assertCanAddHouseholdMember(seedUuid(0, '20'), seedUuid(0, '1b'), {
        query: transaction,
      })
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
