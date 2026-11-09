import { getOrCreateIndividual } from '@services/individuals-households/individuals/individuals'
import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  assertIndividualHouseholdRoom,
  insertHouseholdMember,
  insertOwnedHousehold,
} from '@services/individuals-households/household-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const ownerInsertQuery = '/* insertOwnedHousehold */'
const individualRoomQuery = '/* assertIndividualHouseholdRoom */'
const memberInsertQuery = '/* insertHouseholdMember */'

export async function runHouseholdLimitScenarios(): Promise<void> {
  registerScenarioContract('household-individual-bind', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['users_pkey'], queryContains: '/* getIndividual */' },
      {
        kind: 'usesIndexes',
        indexes: ['users_pkey'],
        queryContains: '/* createRepresentativeIndividual */',
      },
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
    ['getIndividual', 'getOrCreateIndividual:lock-user', 'createRepresentativeIndividual'],
  )

  registerScenarioContract('household-owner-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['uniq_households__owner_user_id_owner_slot'],
        queryContains: ownerInsertQuery,
      },
      {
        kind: 'usesIndexes',
        indexes: [
          'uniq_households__owner_user_id_owner_slot',
          'idx_household_members__individual_household',
        ],
        queryContains: individualRoomQuery,
      },
      { kind: 'maxProcessedRows', relation: 'households', max: 16 },
      { kind: 'maxProcessedRows', relation: 'household_members', max: 8 },
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
    ],
  })
  await runAndCapture(
    'household-owner-capacity',
    async () => {
      await using transaction = await beginTransaction()
      // The explain seed already owns the signup household and one spending household, so every
      // slot is taken and the insert refuses.
      await assert.rejects(() => insertOwnedHousehold(seedUser.id, { query: transaction }), {
        code: 'HOUSEHOLD_LIMIT_REACHED',
      })
      await assertIndividualHouseholdRoom(seedUser.id, { query: transaction })
      await transaction.rollback()
    },
    undefined,
    ['insertOwnedHousehold', 'insertOwnedHousehold:count', 'assertIndividualHouseholdRoom'],
  )

  registerScenarioContract('household-member-capacity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['uniq_household_members__household_id_member_slot'],
        queryContains: memberInsertQuery,
      },
      { kind: 'maxProcessedRows', relation: 'households', max: 8 },
      { kind: 'maxProcessedRows', relation: 'household_members', max: 64 },
      { kind: 'maxProcessedRows', relation: 'users', max: 4 },
    ],
  })
  await runAndCapture(
    'household-member-capacity',
    async () => {
      await using transaction = await beginTransaction()
      // Household tag 20 of owner 0 holds one member; individual 1b of owner 1 joins it.
      const inserted = await insertHouseholdMember(
        {
          householdId: seedUuid(0, '20'),
          individualId: seedUuid(1, '1b'),
          relationship: null,
        },
        { query: transaction },
      )
      assert.equal(inserted, true)
      await transaction.rollback()
    },
    undefined,
    ['insertHouseholdMember:existing', 'insertHouseholdMember', 'insertHouseholdMember:count'],
  )
}
