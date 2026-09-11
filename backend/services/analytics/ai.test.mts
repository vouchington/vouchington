import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { trackAIEmbeddingCall, trackAIEmbeddingShortCircuit, trackAIModerationCall } from './ai.mts'

describe('ai', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-ai-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('trackAIEmbeddingCall', () => {
    it('records a successful embedding call', async () => {
      trackAIEmbeddingCall({
        service: 'bedrock',
        model: 'nova-2-multimodal-embeddings-v1',
        entityType: 'post',
        tokens: 512,
        durationMs: 80,
        success: true,
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'embedding' AND model = 'nova-2-multimodal-embeddings-v1'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.kind).toBe('embedding')
      expect(Number(row.tokens)).toBe(512)
      expect(row.entity_type).toBe('post')
    })

    it('records the invocation field when provided', async () => {
      const model = 'nova-2-multimodal-embeddings-invocation-test'
      trackAIEmbeddingCall({
        service: 'bedrock',
        model,
        entityType: 'topic',
        tokens: 100,
        durationMs: 50,
        success: true,
        invocation: 'single',
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'embedding' AND model = '${model}'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.invocation).toBe('single')
    })
  })

  describe('trackAIEmbeddingShortCircuit', () => {
    it('records a short-circuit event with reason and entity_type', async () => {
      trackAIEmbeddingShortCircuit({ reason: 'batch_lock', entityType: 'post' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'embedding_short_circuit' AND reason = 'batch_lock'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.kind).toBe('embedding_short_circuit')
      expect(row.reason).toBe('batch_lock')
      expect(row.entity_type).toBe('post')
    })

    it('records centralized_cache reason', async () => {
      trackAIEmbeddingShortCircuit({ reason: 'centralized_cache', entityType: 'topic' })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'embedding_short_circuit' AND reason = 'centralized_cache'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.entity_type).toBe('topic')
    })

    it('records single_skipped_for_backlog reason', async () => {
      trackAIEmbeddingShortCircuit({
        reason: 'single_skipped_for_backlog',
        entityType: 'rss_feed_item',
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'embedding_short_circuit' AND reason = 'single_skipped_for_backlog'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.entity_type).toBe('rss_feed_item')
    })
  })

  describe('trackAIModerationCall', () => {
    it('records a failed moderation call with error_type', async () => {
      trackAIModerationCall({
        service: 'openai',
        model: 'omni-moderation',
        tokens: 256,
        durationMs: 60,
        success: false,
        errorType: 'rate_limit',
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ai_calls WHERE kind = 'moderation' AND model = 'omni-moderation'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.kind).toBe('moderation')
      expect(row.error_type).toBe('rate_limit')
    })
  })
})
