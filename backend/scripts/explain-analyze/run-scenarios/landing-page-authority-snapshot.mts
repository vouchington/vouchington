import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import { createMyLandingPage } from '../run-services.mts'
import { deleteMyLandingPage } from '@services/my/landing-pages/delete'
import { setMyLandingPageDefault } from '@services/my/landing-pages/set-default'
import { updateMyLandingPage } from '@services/my/landing-pages/update'
import { runLandingPageDefaultReadProbes } from './landing-page-default-reads.mts'
import {
  getUsernameForLandingPages,
  promoteOldestRemainingLandingPage,
  MAX_LANDING_PAGES,
} from '@services/my/landing-pages/shared'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** Own the pages and restore write preconditions before paired, rolled-back plan captures. */
export async function runLandingPageAuthoritySnapshotScenarios(): Promise<void> {
  const username = `explain-landing-${randomUUID()}`
  const created = await write<{ id: string }>(
    '/* seedLandingAuthorityOwner */ INSERT INTO users (username) VALUES ($1) RETURNING id',
    [username],
  )
  const userId = created.rows[0]!.id
  let noiseUserIds: string[] = []
  try {
    const first = await createMyLandingPage(userId, { title: 'First', slug: 'first' })
    const second = await createMyLandingPage(userId, { title: 'Second', slug: 'second' })
    const third = await createMyLandingPage(userId, { title: 'Third', slug: 'third' })
    const noise = await write<{ id: string }>(
      `/* seedLandingAuthorityNoise */ WITH owners AS (
         INSERT INTO users (username)
         SELECT $1 || '-' || n FROM generate_series(1, $2::integer) AS n RETURNING id
       ), pages AS (
         INSERT INTO user_landing_pages (user_id, title, slug, is_default, slot)
         SELECT owners.id, 'Explain noise', 'noise-' || page, page = 1, page
         FROM owners CROSS JOIN generate_series(1, $3::integer) AS page RETURNING user_id
       ) SELECT id FROM owners`,
      [
        `explain-landing-noise-${randomUUID()}`,
        Math.ceil(2000 / MAX_LANDING_PAGES),
        MAX_LANDING_PAGES,
      ],
    )
    noiseUserIds = noise.rows.map(row => row.id)
    await write(
      `/* seedLandingAuthoritySlotCapacity */ INSERT INTO user_landing_pages
         (user_id, slot, title, slug)
       SELECT $1, slot, 'Slot capacity', 'slot-capacity-' || slot
       FROM generate_series(4, $2::integer - 1) AS slot`,
      [userId, MAX_LANDING_PAGES],
    )
    await write(`/* analyzeLandingAuthorityCorpus */ ANALYZE users, user_landing_pages`)
    registerScenarioContract('landing-page-create', {
      allowEmptyResult: true,
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_user_landing_pages__user_id_id'],
          queryContains: 'FROM user_landing_pages',
        },
        // A full owner page bounds the count, free-slot probes and first-page check.
        {
          kind: 'maxProcessedRows',
          relation: 'user_landing_pages',
          max: 2 * MAX_LANDING_PAGES + 2,
        },
      ],
    })
    const landingPageSlug = `explain-${randomUUID()}`
    await runAndCapture(
      'landing-page-create',
      () =>
        createMyLandingPage(userId, {
          title: 'Explain landing page',
          slug: landingPageSlug,
        }),
      undefined,
      ['createMyLandingPage'],
      {
        afterCapture: async () => {
          await write(sql`/* explain-cleanup-landing-page */
            DELETE FROM user_landing_pages WHERE user_id = ${userId} AND slug = ${landingPageSlug}
          `)
        },
      },
    )

    await write(
      `/* cleanupLandingAuthoritySlotCapacity */ DELETE FROM user_landing_pages
       WHERE user_id = $1 AND slot BETWEEN 4 AND $2::integer - 1`,
      [userId, MAX_LANDING_PAGES],
    )
    await write('/* analyzeLandingAuthorityAfterCapacity */ ANALYZE user_landing_pages')

    for (const id of [
      'landing-page-active-owner-snapshot',
      'landing-page-default-snapshot',
      'landing-page-delete-snapshot',
      'landing-page-promote-snapshot',
    ]) {
      registerScenarioContract(id, {
        allowEmptyResult: true,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'users', max: 2 },
          { kind: 'maxProcessedRows', relation: 'user_landing_pages', max: MAX_LANDING_PAGES },
        ],
      })
    }
    await runAndCapture(
      'landing-page-active-owner-snapshot',
      async () => {
        await using query = await beginTransaction()
        assert.equal(await getUsernameForLandingPages(userId, { query }), username)
        await query.rollback()
        await runLandingPageDefaultReadProbes(userId, username)
      },
      undefined,
      [
        'getUsernameForLandingPages',
        'listLandingPagesForUser',
        'listLandingPagesForUserPage',
        'getPublicLandingPage',
        'getLandingPageRowByUsernameAndSlug',
      ],
    )
    await runAndCapture(
      'landing-page-default-snapshot',
      async () => {
        const page = await setMyLandingPageDefault(userId, second.id)
        assert.equal(page.id, second.id)
        assert.equal(page.is_default, true)
      },
      undefined,
      ['getLandingPageRowForUser', 'setMyLandingPageDefault'],
    )
    await runAndCapture(
      'landing-page-delete-snapshot',
      async () => {
        await deleteMyLandingPage(userId, third.id)
        const remaining = await write<{ page_count: number; page_exists: boolean }>(
          `/* verifyLandingAuthorityDelete */ SELECT
             (SELECT COUNT(*)::integer FROM user_landing_pages WHERE user_id = $2) AS page_count,
             EXISTS (SELECT 1 FROM user_landing_pages WHERE id = $1 AND user_id = $2) AS page_exists
           `,
          [third.id, userId],
        )
        assert.deepEqual(remaining.rows, [{ page_count: 2, page_exists: false }])
      },
      undefined,
      ['deleteMyLandingPage'],
      {
        afterCapture: async () => {
          await write(
            `/* restoreLandingAuthorityDelete */ INSERT INTO user_landing_pages
               (id, user_id, slot, title, slug, is_default) VALUES ($1, $2, 3, 'Third', 'third', FALSE)`,
            [third.id, userId],
          )
        },
      },
    )
    await write(
      '/* clearLandingAuthorityDefault */ UPDATE user_landing_pages SET is_default = FALSE WHERE user_id = $1 AND is_default',
      [userId],
    )
    await runAndCapture(
      'landing-page-promote-snapshot',
      async () => {
        const updated = await updateMyLandingPage(userId, first.id, { title: 'First updated' })
        assert.equal(updated.is_default, true)
        await using query = await beginTransaction()
        await promoteOldestRemainingLandingPage(userId, query)
        const promoted = await query<{ id: string }>(
          '/* verifyLandingAuthorityPromotion */ SELECT id FROM user_landing_pages WHERE user_id = $1 AND is_default',
          [userId],
        )
        assert.deepEqual(promoted.rows, [{ id: first.id }])
        await query.rollback()
      },
      undefined,
      ['promoteOldestRemainingLandingPage', 'updateMyLandingPage'],
    )
  } finally {
    await write(
      '/* cleanupLandingAuthorityOwners */ DELETE FROM users WHERE id = ANY($1::uuid[])',
      [[userId, ...noiseUserIds]],
    )
    await write(`/* vacuumLandingAuthorityCorpus */ VACUUM (ANALYZE)
      users, user_landing_pages`)
  }
}
