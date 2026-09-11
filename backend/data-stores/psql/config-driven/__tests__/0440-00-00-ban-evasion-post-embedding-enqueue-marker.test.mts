import { describe, expect, it } from 'vitest'
import generateSql from '../0440-00-00-ban-evasion-post-embedding-enqueue-marker.mts'

describe('ban-evasion post embedding enqueue marker config-driven migration', () => {
  it('adds marker schema without marking existing embeddings as enqueued', () => {
    const sql = generateSql()

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ban_evasion_post_embedding_input_sha256 BYTEA')
    expect(sql).toContain('idx_posts__ban_evasion_post_embedding_pending')
    expect(sql).not.toMatch(/UPDATE\s+posts/i)
  })
})
