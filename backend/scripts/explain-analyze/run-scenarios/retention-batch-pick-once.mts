import { write } from '@data-stores/psql'
import { cleanupTerminalNotificationPushIntents } from '@services/data-retention/cleanup-notification-push-intents'
import { deleteExpiredBlueskyHandoffBatch } from '@services/data-retention/abandoned-bluesky-sessions'
import { softDeleteChildrenForUser } from '@services/user-referral-program-links/children'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { FORCE_RESCAN_SETTINGS } from './orphaned-oauth-batch.mts'

const DAY_MS = 86_400_000
const HANDLE_PREFIX = 'explain-batch-pick-'
const URL_PREFIX = 'https://explain-batch-pick.example.test/'
const PARENT_LABEL = 'explain-batch-pick-parent'
const CHILD_LABEL = 'explain-batch-pick-child'

// The production call consumes one row, and the replay then needs several left to over-delete.
// A DELETE or UPDATE without RETURNING reports no root rows, so each contract allows an empty result.
function registerPickOnce(id: string, relation: string) {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'custom', name: 'batchPickEvaluatedOnce' },
      { kind: 'maxProcessedRows', relation, max: 100 },
    ],
    allowEmptyResult: true,
  })
}

/** Each batch statement's limited pick must run once, so one statement never exceeds its batch size. */
export async function runRetentionBatchPickOnceScenarios(): Promise<void> {
  await runBlueskyCompletionPick()
  await runPushIntentPick()
  await runReferralChildrenPick()
}

async function runBlueskyCompletionPick(): Promise<void> {
  registerPickOnce('bluesky-handoff-completion-batch-pick-once', 'bluesky_link_completions')
  const now = new Date()
  try {
    await write(
      `/* explainAnalyzeRun */ WITH auths AS (
         INSERT INTO bluesky_link_authorizations
           (user_id, handle, callback_mode, callback_claimed_at, claimed_did, expires_at)
         SELECT $1::uuid, $2 || g, 'web', $3::timestamptz, 'did:plc:' || $2 || g,
           $3::timestamptz + g * interval '1 minute'
         FROM generate_series(1, 5) g
         RETURNING id, handle, claimed_did, expires_at
       ), accounts AS (
         INSERT INTO bluesky_linked_accounts
           (link_authorization_id, bluesky_did, user_id, handle, session_ciphertext)
         SELECT id, claimed_did, NULL, handle, 'synthetic-ciphertext' FROM auths
       )
       INSERT INTO bluesky_link_completions
         (account_link_authorization_id, user_id, handle, token_hash, expires_at)
       SELECT id, $1::uuid, handle, repeat('a', 64), expires_at FROM auths`,
      [seedUser.id, HANDLE_PREFIX, new Date(now.getTime() - 400 * DAY_MS)],
    )
    await runAndCapture(
      'bluesky-handoff-completion-batch-pick-once',
      () => deleteExpiredBlueskyHandoffBatch(1, { now }),
      undefined,
      'deleteExpiredNonHandoffCompletions',
      { localSettings: FORCE_RESCAN_SETTINGS },
    )
  } finally {
    const owned = `(SELECT id FROM bluesky_link_authorizations WHERE handle LIKE $1)`
    await write(
      `/* explainAnalyzeRun */ DELETE FROM bluesky_link_completions
       WHERE account_link_authorization_id IN ${owned}`,
      [`${HANDLE_PREFIX}%`],
    )
    await write(
      `/* explainAnalyzeRun */ DELETE FROM bluesky_linked_accounts
       WHERE link_authorization_id IN ${owned}`,
      [`${HANDLE_PREFIX}%`],
    )
    await write(
      `/* explainAnalyzeRun */ DELETE FROM bluesky_link_authorizations WHERE handle LIKE $1`,
      [`${HANDLE_PREFIX}%`],
    )
  }
}

async function runPushIntentPick(): Promise<void> {
  registerPickOnce('terminal-push-intent-batch-pick-once', 'notification_push_intents')
  const now = new Date()
  const { rows } = await write<{ id: string }>(
    `/* explainAnalyzeRun */ INSERT INTO notifications
       (user_id, entity_type, kind, delivery_type, target_path)
     SELECT $1::uuid, 'referral_click', 'referral_click', 'subscription', '/my/referrals'
     FROM generate_series(1, 5) RETURNING id`,
    [seedUser.id],
  )
  const ids = rows.map(row => row.id)
  try {
    // Creating a notification captures its pending intent; deliver them long before the cutoff.
    await write(
      `/* explainAnalyzeRun */ UPDATE notification_push_intents intent
       SET delivered_at = $3::timestamptz + t.n * interval '1 minute'
       FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, n)
       WHERE intent.user_id = $1::uuid AND intent.notification_id = t.id`,
      [seedUser.id, ids, new Date(now.getTime() - 400 * DAY_MS)],
    )
    await runAndCapture(
      'terminal-push-intent-batch-pick-once',
      () =>
        cleanupTerminalNotificationPushIntents({
          batchSize: 1,
          maxBatches: 1,
          retentionDays: 90,
          now,
        }),
      undefined,
      'deleteTerminalNotificationPushIntentBatch',
      { localSettings: FORCE_RESCAN_SETTINGS },
    )
  } finally {
    await write(
      `/* explainAnalyzeRun */ DELETE FROM notifications WHERE user_id = $1::uuid AND id = ANY($2::uuid[])`,
      [seedUser.id, ids],
    )
  }
}

async function runReferralChildrenPick(): Promise<void> {
  registerPickOnce('referral-children-soft-delete-batch-pick-once', 'user_referral_program_links')
  try {
    await write(
      `/* explainAnalyzeRun */ WITH program AS (
         SELECT topic_id FROM referral_program_topics ORDER BY topic_id LIMIT 1
       ), hostname AS (
         SELECT id FROM url_hostnames ORDER BY id LIMIT 1
       ), new_urls AS (
         INSERT INTO urls (url, hostname_id, search_params)
         SELECT $2 || g, hostname.id, '{}'::jsonb FROM hostname, generate_series(0, 5) g
         RETURNING id, url
       ), parent AS (
         INSERT INTO user_referral_program_links
           (user_id, referral_program_topic_id, url_id, label, created_via)
         SELECT $1::uuid, program.topic_id, new_urls.id, $3, 'system'
         FROM program, new_urls WHERE new_urls.url = $2 || 0
         RETURNING id, referral_program_topic_id
       )
       INSERT INTO user_referral_program_links
         (user_id, referral_program_topic_id, url_id, label, created_via, parent_link_id)
       SELECT $1::uuid, parent.referral_program_topic_id, new_urls.id, $4, 'system', parent.id
       FROM parent, new_urls WHERE new_urls.url <> $2 || 0`,
      [seedUser.id, URL_PREFIX, PARENT_LABEL, CHILD_LABEL],
    )
    await runAndCapture(
      'referral-children-soft-delete-batch-pick-once',
      () => softDeleteChildrenForUser(seedUser.id),
      undefined,
      'softDeleteChildrenForUser',
      {
        localSettings: FORCE_RESCAN_SETTINGS,
        // The production loop soft-deletes every child; the replay needs them active again.
        afterCapture: async () => {
          await write(
            `/* explainAnalyzeRun */ UPDATE user_referral_program_links SET deleted_at = NULL
             WHERE label = $1`,
            [CHILD_LABEL],
          )
        },
      },
    )
  } finally {
    await write(`/* explainAnalyzeRun */ DELETE FROM urls WHERE url LIKE $1`, [`${URL_PREFIX}%`])
  }
}
