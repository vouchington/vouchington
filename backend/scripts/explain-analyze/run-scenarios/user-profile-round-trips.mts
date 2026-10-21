import {
  createMyLandingPage,
  createIndividualCard,
  createDataRequest,
  getOrCreateIndividual,
  reorderProfileLinks,
  upsertUserFinancialProfile,
} from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { read, write } from '@data-stores/psql'
import { deletionRequestPriorUsernameQuery } from '@services/data-retention/cleanup-soft-deleted-user'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runUserProfileRoundTripScenarios(): Promise<void> {
  const { rows: cardTopics } = await read<{ id: string }>(
    `/* explain-card-topic-fixture */
      SELECT id FROM topics WHERE topic_type = 'card' AND deleted_at IS NULL LIMIT 1`,
  )
  if (!cardTopics[0]) throw new Error('The individual-card scenario needs a seeded card topic')
  registerScenarioContract('individual-card-create', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['users_pkey', 'topics_pkey'],
        queryContains: 'WITH valid_topic AS MATERIALIZED',
      },
      // Both modes touch two users, one topic, and one inserted card; budgets add 20%.
      { kind: 'maxProcessedRows', relation: 'users', max: 3 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'individual_cards', max: 2 },
    ],
  })
  await runAndCapture(
    'individual-card-create',
    () => createIndividualCard(seedUser, seedUser, cardTopics[0]!.id),
    undefined,
    'createIndividualCard',
  )

  const representativeIndividual = await getOrCreateIndividual(seedUser)
  registerScenarioContract('individual-representative-read', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['individuals_pkey'],
        queryContains: 'LEFT JOIN individuals',
      },
      // Both modes read one user and one representative row; budgets add 20%.
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'individuals', max: 2 },
    ],
  })
  await runAndCapture(
    'individual-representative-read',
    async () => {
      const measured = await getOrCreateIndividual(seedUser)
      if (measured.id !== representativeIndividual.id)
        throw new Error('Representative individual read must return the seeded user association')
    },
    undefined,
    'getIndividual',
  )

  registerScenarioContract('landing-page-create', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_user_landing_pages__user_id_id'],
        queryContains: 'FROM user_landing_pages',
      },
      // Both modes process one landing-page row; budget adds 20%.
      { kind: 'maxProcessedRows', relation: 'user_landing_pages', max: 2 },
    ],
  })
  const landingPageSlug = `explain-${crypto.randomUUID()}`
  await runAndCapture(
    'landing-page-create',
    () =>
      createMyLandingPage(seedUser.id, {
        title: 'Explain landing page',
        slug: landingPageSlug,
      }),
    undefined,
    'createMyLandingPage',
    {
      afterCapture: async () => {
        await write(sql`/* explain-cleanup-landing-page */
          DELETE FROM user_landing_pages WHERE user_id = ${seedUser.id} AND slug = ${landingPageSlug}
        `)
      },
    },
  )

  registerScenarioContract('data-request-create', {
    // Both modes insert one data-request row; budget adds 20%.
    expectations: [{ kind: 'maxProcessedRows', relation: 'user_data_requests', max: 2 }],
  })
  let dataRequestId: string | undefined
  await runAndCapture(
    'data-request-create',
    async () => {
      dataRequestId = (await createDataRequest(seedUser.id, seedUser.id)).id
    },
    undefined,
    'createDataRequest',
    {
      afterCapture: async () => {
        if (!dataRequestId) throw new Error('Data-request scenario did not return its created row')
        await write(sql`/* explain-cleanup-data-request */
          DELETE FROM user_data_requests WHERE id = ${dataRequestId}
        `)
      },
    },
  )

  registerScenarioContract('financial-profile-upsert', {
    // Both modes touch one owner, individual, and financial-profile row per statement; +20%.
    expectations: [
      { kind: 'maxProcessedRows', relation: 'users', max: 2 },
      { kind: 'maxProcessedRows', relation: 'individuals', max: 2 },
      { kind: 'maxProcessedRows', relation: 'individual_financial_profiles', max: 2 },
    ],
  })
  await runAndCapture(
    'financial-profile-upsert',
    () => upsertUserFinancialProfile(seedUser.id, { hard_inquiries_12m: 4 }),
    undefined,
    ['upsertUserFinancialProfile:lockOwner', 'upsertUserFinancialProfile'],
  )

  const { rows: profileLinks } = await read<{ id: string }>(
    `/* explain-profile-link-reorder-fixture */
      SELECT id FROM user_profile_links WHERE user_id = $1 ORDER BY id`,
    [seedUser.id],
  )
  if (profileLinks.length === 0)
    throw new Error('The profile-link reorder scenario needs seeded links for seedUser')
  registerScenarioContract('profile-link-reorder', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_user_profile_links__user_id_sort'],
        queryContains: 'WITH existing AS MATERIALIZED',
      },
      // Both modes process nine profile-link rows across validation and update; budget is +20%.
      { kind: 'maxProcessedRows', relation: 'user_profile_links', max: 11 },
    ],
  })
  await runAndCapture(
    'profile-link-reorder',
    () =>
      reorderProfileLinks(
        seedUser.id,
        profileLinks.map(row => row.id),
      ),
    undefined,
    'reorderProfileLinks',
  )

  const { rows: insertedDeletionRequests } = await write<{ user_id: string }>(sql`
    /* explainDeletedUserPriorUsername */
    INSERT INTO user_deletion_requests (user_id, requested_by_id, prior_username)
    VALUES (${seedUser.id}, ${seedUser.id}, ${seedUser.username})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  `)
  const insertedDeletionRequestUserId = insertedDeletionRequests[0]?.user_id
  registerScenarioContract('deleted-user-prior-username', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['user_deletion_requests_user_id_key'],
        queryContains: 'prior_username',
      },
      // One unique-index lookup. Budget is the measured row plus 20%.
      { kind: 'maxProcessedRows', relation: 'user_deletion_requests', max: 2 },
    ],
  })
  try {
    await runAndCapture(
      'deleted-user-prior-username',
      () => read(deletionRequestPriorUsernameQuery(seedUser.id)),
      undefined,
      'cleanupSoftDeletedUserBatch:priorUsername',
    )
  } finally {
    if (insertedDeletionRequestUserId)
      await write(sql`/* explain-cleanup-deletion-request */
        DELETE FROM user_deletion_requests WHERE user_id = ${insertedDeletionRequestUserId}
      `)
  }
}
