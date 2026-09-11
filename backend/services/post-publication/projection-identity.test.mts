import { describe, expect, it } from 'vitest'
import { publicationProjectionIdentitySql } from './projection-identity.mts'

describe('post publication projection identity SQL', () => {
  it("does not cap a post's exact projection identities", () => {
    expect(publicationProjectionIdentitySql().text).not.toContain('LIMIT')
  })

  it('unions relation-only alias membership into topicIds', () => {
    const sql = publicationProjectionIdentitySql().text
    expect(sql).toContain('relation__post__category__topic_alias')
    expect(sql).toContain('votes_score_net > 0')
    expect(sql).toContain('deleted_at IS NULL')
  })
})
