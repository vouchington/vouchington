import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'

const lifecycleConstraints = [
  'admin_import_batches.chk_admin_import_batches__lifecycle',
  'admin_import_rows.chk_admin_import_rows__lifecycle',
  'bedrock_embeddings_batches.chk_bedrock_embeddings_batches__lifecycle',
  'follower_distributions.chk_follower_distributions__audience_selection',
  'images.chk_images__upload_lifecycle',
  'moderation_training_feedbacks.chk_moderation_training_feedbacks__targets',
  'user_data_requests.chk_user_data_requests__lifecycle',
  'user_rss_feed_import_batches.chk_user_rss_feed_import_batches__lifecycle',
  'user_rss_feed_import_rows.chk_user_rss_feed_import_rows__lifecycle',
] as const

const guardedLifecycleColumns = {
  agent_responses: ['completed_at', 'failed_at'],
  admin_import_batches: ['completed_at'],
  admin_import_rows: ['completed_at', 'failed_at'],
  bedrock_embeddings_batches: ['completed_at', 'failed_at', 'cancelled_at'],
  images: ['upload_completed_at', 'upload_failed_at'],
  user_data_requests: ['completed_at', 'failed_at'],
  user_rss_feed_import_batches: ['completed_at'],
  user_rss_feed_import_rows: ['completed_at', 'failed_at'],
} as const

describe('PostgreSQL lifecycle integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('installs lifecycle checks for asynchronous work tables', async () => {
    const { rows } = await read<{ qualified_name: string }>(
      `/* getLifecycleConstraints */
        SELECT table_definition.relname || '.' || constraint_definition.conname AS qualified_name
        FROM pg_constraint constraint_definition
        JOIN pg_class table_definition
          ON table_definition.oid = constraint_definition.conrelid
        JOIN pg_namespace namespace
          ON namespace.oid = table_definition.relnamespace
        WHERE namespace.nspname = 'public'
          AND constraint_definition.contype = 'c'
          AND table_definition.relname = ANY($1)
        ORDER BY qualified_name`,
      [[...new Set(lifecycleConstraints.map(name => name.split('.')[0]))]],
    )

    const installed = new Set(rows.map(row => row.qualified_name))
    expect(lifecycleConstraints.filter(name => !installed.has(name))).toEqual([])
  })

  it('guards terminal lifecycle timestamps from being cleared or switched', async () => {
    const { rows } = await read<{ table_name: string; trigger_definition: string }>(
      `/* getTerminalLifecycleGuardTriggers */
        SELECT
          table_definition.relname AS table_name,
          pg_get_triggerdef(trigger_definition.oid) AS trigger_definition
        FROM pg_trigger trigger_definition
        JOIN pg_class table_definition
          ON table_definition.oid = trigger_definition.tgrelid
        JOIN pg_namespace namespace
          ON namespace.oid = table_definition.relnamespace
        WHERE namespace.nspname = 'public'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgname LIKE 'trigger_%_guard_terminal_lifecycle'
          AND table_definition.relname = ANY($1)
        ORDER BY table_name`,
      [[...Object.keys(guardedLifecycleColumns)]],
    )

    expect(rows.map(row => row.table_name)).toEqual(Object.keys(guardedLifecycleColumns).toSorted())
    for (const row of rows) {
      const columns =
        guardedLifecycleColumns[row.table_name as keyof typeof guardedLifecycleColumns]
      for (const column of columns) expect(row.trigger_definition).toContain(`'${column}'`)
    }

    const { rows: functions } = await read<{ function_definition: string }>(
      `/* getTerminalLifecycleGuardFunction */
        SELECT pg_get_functiondef(oid) AS function_definition
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = 'fn_guard_terminal_lifecycle'`,
    )
    expect(functions).toHaveLength(1)
    expect(functions[0]!.function_definition).toContain('IS DISTINCT FROM')
  })

  it('rejects contradictory lifecycle inserts', async () => {
    const user = await createLocalTestUser()
    await expect(
      write(sql`/* rejectContradictoryImageLifecycle */
        INSERT INTO images (
          created_by_id, data, sha_256, s3_key, upload_started_at,
          upload_completed_at, upload_failed_at, upload_error
        ) VALUES (
          ${user.id}, '{}'::jsonb, ${randomBytes(32)}, ${`test/${randomUUID()}`},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'failed'
        )`),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`/* rejectContradictoryDataRequestLifecycle */
        INSERT INTO user_data_requests (completed_at)
        VALUES (CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`/* rejectContradictoryBedrockBatchLifecycle */
        INSERT INTO bedrock_embeddings_batches (
          id, model_id, job_type, completed_at, failed_at
        ) VALUES (
          ${`lifecycle-${randomUUID()}`}, 'test-model', 'topics',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: batchRows } = await write<{ id: string }>(sql`
      INSERT INTO user_rss_feed_import_batches (user_id, total_rows)
      VALUES (${user.id}, 1)
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectContradictoryRssImportRowLifecycle */
        INSERT INTO user_rss_feed_import_rows (
          batch_id, row_index, input_url, outcome, completed_at, error_message
        ) VALUES (
          ${batchRows[0]!.id}, 0, 'https://example.com/feed.xml', 'error',
          CURRENT_TIMESTAMP, 'failed'
        )`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('requires Bluesky authorization handles exactly while lifecycle state is active', async () => {
    const user = await createLocalTestUser()
    await expect(
      write(sql`/* rejectTerminalBlueskyAuthorizationHandle */
        INSERT INTO bluesky_link_authorizations (
          user_id, handle, callback_mode, status, expires_at
        ) VALUES (
          ${user.id}, 'retained-handle.bsky.social', 'web', 'rejected', CURRENT_TIMESTAMP
        )`),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`/* rejectActiveBlueskyAuthorizationWithoutHandle */
        INSERT INTO bluesky_link_authorizations (
          user_id, handle, callback_mode, status, expires_at
        ) VALUES (${user.id}, NULL, 'web', 'pending', CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects rewrites after asynchronous work reaches a terminal state', async () => {
    const user = await createLocalTestUser()
    const { rows: agentResponseRows } = await write<{ id: string }>(sql`
      INSERT INTO agent_responses (created_by_id, agent, completed_at)
      VALUES (${user.id}, 'research', CURRENT_TIMESTAMP)
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectTerminalAgentResponseRewrite */
        UPDATE agent_responses
        SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
        WHERE id = ${agentResponseRows[0]!.id}`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: imageRows } = await write<{ id: string }>(sql`
      INSERT INTO images (
        created_by_id, data, sha_256, s3_key, upload_started_at, upload_completed_at
      ) VALUES (
        ${user.id}, '{}'::jsonb, ${randomBytes(32)}, ${`test/${randomUUID()}`},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectTerminalImageRewrite */
        UPDATE images
        SET upload_completed_at = NULL,
            upload_failed_at = CURRENT_TIMESTAMP,
            upload_error = 'failed'
        WHERE id = ${imageRows[0]!.id}`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: requestRows } = await write<{ id: string }>(sql`
      INSERT INTO user_data_requests (processing_started_at, completed_at)
      VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectTerminalDataRequestRewrite */
        UPDATE user_data_requests
        SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
        WHERE id = ${requestRows[0]!.id}`),
    ).rejects.toMatchObject({ code: '23514' })

    const bedrockId = `lifecycle-${randomUUID()}`
    await write(sql`
      INSERT INTO bedrock_embeddings_batches (
        id, model_id, job_type, submitted_at, completed_at
      ) VALUES (
        ${bedrockId}, 'test-model', 'topics', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `)
    await expect(
      write(sql`/* rejectTerminalBedrockBatchRewrite */
        UPDATE bedrock_embeddings_batches
        SET completed_at = NULL, failed_at = CURRENT_TIMESTAMP
        WHERE id = ${bedrockId}`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: batchRows } = await write<{ id: string }>(sql`
      INSERT INTO user_rss_feed_import_batches (
        user_id, total_rows, completed_rows, completed_at
      ) VALUES (${user.id}, 1, 1, CURRENT_TIMESTAMP)
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectTerminalRssImportBatchRewrite */
        UPDATE user_rss_feed_import_batches
        SET completed_at = NULL
        WHERE id = ${batchRows[0]!.id}`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('bounds selected follower distribution recipients in the database', async () => {
    const { rows } = await read<{ constraint_definition: string }>(
      `/* getFollowerDistributionAudienceConstraint */
        SELECT pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conrelid = 'follower_distributions'::regclass
          AND conname = 'chk_follower_distributions__audience_selection'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.constraint_definition).toContain(
      'cardinality(selected_recipient_user_ids) <= 100',
    )
  })

  it('binds moderation feedback source-specific targets', async () => {
    const { rows } = await read<{ constraint_definition: string }>(
      `/* getModerationTrainingTargetConstraint */
        SELECT pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conrelid = 'moderation_training_feedbacks'::regclass
          AND conname = 'chk_moderation_training_feedbacks__targets'`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.constraint_definition).toContain("source_type = 'moderation_report'")
    expect(rows[0]!.constraint_definition).toContain('moderation_report_id IS NOT NULL')
    expect(rows[0]!.constraint_definition).toContain("source_type = 'moderation_appeal'")
    expect(rows[0]!.constraint_definition).toContain('moderation_appeal_id IS NOT NULL')
    expect(rows[0]!.constraint_definition).toContain("source_type = 'review_dispute'")
    expect(rows[0]!.constraint_definition).toContain('review_dispute_id IS NOT NULL')
  })
})
