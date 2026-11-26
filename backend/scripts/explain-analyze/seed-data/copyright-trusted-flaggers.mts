import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const flaggerCount = 640
const histories = [
  { changes: [], status: 'active' },
  { changes: ['suspended', 'reinstated'], status: 'active' },
  { changes: ['suspended', 'reinstated', 'suspended'], status: 'suspended' },
  {
    changes: ['suspended', 'reinstated', 'suspended', 'reinstated', 'revoked'],
    status: 'revoked',
  },
] as const

export async function seedCopyrightTrustedFlaggers(actorId: string) {
  const now = Date.now()
  const firstIdOffset = randomInt(1, 2 ** 32)
  const listings = Array.from({ length: flaggerCount }, (_, index) => {
    const history = histories[index % histories.length]!
    return {
      id: seedUuidAtTimestamp(now, firstIdOffset + index),
      name: `EXPLAIN trusted flagger ${index}`,
      userId: index % 5 === 0 ? null : seedUuid(index, '01'),
      history,
    }
  })
  const ids = listings.map(listing => listing.id)
  const transitions = listings.flatMap(({ id, history }, index) => {
    const changeIds = history.changes.map((_, ordinal) =>
      seedUuidAtTimestamp(now + ordinal + 1, firstIdOffset + index),
    )
    return history.changes.map((type, ordinal) => ({
      id: changeIds[ordinal]!,
      flaggerId: id,
      previousId: changeIds[ordinal - 1] ?? null,
      type,
    }))
  })

  await using transaction = await beginTransaction()
  const insertedFlaggers = await transaction(
    `/* seedCopyrightTrustedFlaggers */
     INSERT INTO copyright_trusted_flaggers (
       id, name, user_id, awarding_coordinator_name, awarding_member_state, awarded_on,
       area_of_expertise, area_description, created_by_id
     )
     SELECT id, name, user_id, 'EXPLAIN coordinator', 'IE', '2025-01-01'::date,
       'intellectual_property', 'Copyright designation fixture', $4::uuid
     FROM unnest($1::uuid[], $2::text[], $3::uuid[]) AS fixture(id, name, user_id)`,
    [ids, listings.map(listing => listing.name), listings.map(listing => listing.userId), actorId],
  )
  assert.equal(insertedFlaggers.rowCount, listings.length)
  const insertedChanges = await transaction(
    `/* seedCopyrightTrustedFlaggerChanges */
     INSERT INTO copyright_trusted_flagger_changes (
       id, copyright_trusted_flagger_id, previous_copyright_trusted_flagger_change_id,
       change_type, changed_by_id, reason
     )
     SELECT id, flagger_id, previous_id, change_type, $5::uuid, 'EXPLAIN status transition'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::copyright_trusted_flagger_change_types[])
       AS fixture(id, flagger_id, previous_id, change_type)`,
    [
      transitions.map(change => change.id),
      transitions.map(change => change.flaggerId),
      transitions.map(change => change.previousId),
      transitions.map(change => change.type),
      actorId,
    ],
  )
  assert.equal(insertedChanges.rowCount, transitions.length)
  await transaction(
    `/* analyzeCopyrightTrustedFlaggerFixture */
     ANALYZE copyright_trusted_flaggers, copyright_trusted_flagger_changes`,
  )
  await transaction.commit()

  return {
    expected: listings.toReversed().map(({ id, name, userId, history }) => ({
      id,
      name,
      user_id: userId,
      awarding_coordinator_name: 'EXPLAIN coordinator',
      awarding_member_state: 'IE',
      awarded_on: '2025-01-01',
      award_reference: null,
      area_of_expertise: 'intellectual_property',
      area_description: 'Copyright designation fixture',
      status: history.status,
    })),
    seededRows: {
      copyright_trusted_flaggers: listings.length,
      copyright_trusted_flagger_changes: transitions.length,
    },
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      // The disposable corpus owns these immutable histories. Scope the purge to their flagger IDs.
      await cleanup(
        `/* permitCopyrightTrustedFlaggerCleanup */
         SELECT set_config('app.copyright_case_purge_notice_id', $1::text, true),
           set_config('app.copyright_case_purge_table', 'copyright_trusted_flagger_changes', true)`,
        [ids[0]!],
      )
      const deletedChanges = await cleanup(
        `/* deleteCopyrightTrustedFlaggerChanges */
         DELETE FROM copyright_trusted_flagger_changes
         WHERE copyright_trusted_flagger_id = ANY($1::uuid[])`,
        [ids],
      )
      assert.equal(deletedChanges.rowCount, transitions.length)
      const deletedFlaggers = await cleanup(
        `/* deleteCopyrightTrustedFlaggers */
         DELETE FROM copyright_trusted_flaggers WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      assert.equal(deletedFlaggers.rowCount, listings.length)
      await cleanup.commit()
    },
  }
}
