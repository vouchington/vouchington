import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildDirectPostEligibilityFilter,
  buildNotificationPostEligibilityFilter,
  buildOtherwisePublicPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from './post-publication-eligibility.mts'

const publicEligibilityViewSql = readFileSync(
  new URL('../../data-stores/psql/views/2025-01-18-public-post-eligibility.sql', import.meta.url),
  'utf8',
)

describe('buildNotificationPostEligibilityFilter', () => {
  it('keeps canonical publication state independent of recipient access', () => {
    const statement = buildNotificationPostEligibilityFilter('candidate_post', 'access_post')

    expect(statement.text).toContain('candidate_post.deleted_at IS NULL')
    expect(statement.text).toContain('access_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).toContain('publication_community.archived_at IS NULL')
    expect(statement.text).toContain('post__stories post_story')
    expect(statement.text).not.toContain("access_post.privacy = 'public'")
    expect(statement.text).not.toContain('publication_member.user_id')
  })
})

describe('buildDirectPostEligibilityFilter', () => {
  it('keeps aliases in SQL while binding only viewer values', () => {
    const statement = buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      isModerationStaff: false,
    })

    expect(statement.text).toContain('candidate_post.approved_at')
    expect(statement.text).toContain('access_post.approved_at')
    expect(statement.text).toContain('post__stories post_story')
    expect(statement.text).not.toContain('publication_community.archived_at')
    expect(statement.values).not.toContain('candidate_post')
    expect(statement.values).not.toContain('access_post')
  })

  it('leaves staff route-type handling to the caller while excluding deleted rows', () => {
    const statement = buildDirectPostEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: null,
      isModerationStaff: true,
    })

    expect(statement.text).toContain('candidate_post.deleted_at IS NULL')
    expect(statement.text).toContain('access_post.deleted_at IS NULL')
    expect(statement.text).not.toContain('approved_at')
    expect(statement.text).not.toContain('post__stories')
  })

  it('rejects aliases that could inject SQL', () => {
    expect(() =>
      buildDirectPostEligibilityFilter('candidate_post; DROP TABLE posts', 'access_post', {
        currentUserId: null,
        isModerationStaff: false,
      }),
    ).toThrow('Unsafe SQL alias')
  })
})

describe('buildPublicPostEligibilityFilter', () => {
  it('enforces candidate and root publication state for anonymous discovery', () => {
    const statement = buildPublicPostEligibilityFilter('candidate_post', 'access_post')

    expect(statement.text).toContain('candidate_post.deleted_at IS NULL')
    expect(statement.text).toContain('access_post.deleted_at IS NULL')
    expect(statement.text).toContain('candidate_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('access_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('candidate_post.openai_omni_moderation_flagged IS NOT TRUE')
    expect(statement.text).toContain('access_post.openai_omni_moderation_flagged IS NOT TRUE')
    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).toContain("access_post.privacy = 'public'")
    expect(statement.text).toContain("access_post.broadcast = 'everyone'")
    expect(statement.text).toContain('publication_suspension.lifted_at IS NULL')
    expect(statement.text).toContain('publication_root_suspension.lifted_at IS NULL')
    expect(statement.text).toContain('publication_community.archived_at IS NULL')
    expect(statement.text).toContain('post__stories post_story')
  })

  it('never permits archived public discovery', () => {
    const statement = buildPublicPostEligibilityFilter('candidate_post', 'access_post')

    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).toContain('access_post.archived_at IS NULL')
  })

  it('allows registered-audience posts only when explicitly requested', () => {
    const statement = buildPublicPostEligibilityFilter('candidate_post', 'access_post', {
      includeRegisteredAudience: true,
    })

    expect(statement.text).toContain("access_post.broadcast IN ('everyone', 'users')")
    expect(statement.text).not.toContain("access_post.broadcast = 'everyone'")
  })

  it('keeps candidate and root moderation gates in the managed eligibility view', () => {
    expect(publicEligibilityViewSql).toContain(
      'candidate_post.openai_omni_moderation_flagged IS NOT TRUE',
    )
    expect(publicEligibilityViewSql).toContain(
      'root_post.openai_omni_moderation_flagged IS NOT TRUE',
    )
  })
})

describe('buildOtherwisePublicPostEligibilityFilter', () => {
  it('keeps every anonymous publication gate except archive state', () => {
    const statement = buildOtherwisePublicPostEligibilityFilter('candidate_post', 'access_post')

    expect(statement.text).toContain('candidate_post.deleted_at IS NULL')
    expect(statement.text).toContain('candidate_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('publication_suspension.lifted_at IS NULL')
    expect(statement.text).toContain("access_post.privacy = 'public'")
    expect(statement.text).toContain("access_post.broadcast = 'everyone'")
    expect(statement.text).toContain('publication_community.archived_at IS NULL')
    expect(statement.text).toContain('post__stories post_story')
    expect(statement.text).not.toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).not.toContain('access_post.archived_at IS NULL')
  })
})

describe('buildViewerPostDiscoveryEligibilityFilter', () => {
  it('composes viewer exceptions with discovery-only archive and suspension gates', () => {
    const statement = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      isAdministrator: false,
    })

    expect(statement.text).toContain('candidate_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).toContain('access_post.archived_at IS NULL')
    expect(statement.text).toContain('publication_suspension.lifted_at IS NULL')
    expect(statement.text).toContain("access_post.broadcast = 'everyone'")
    expect(statement.text).toContain('publication_discovery_follow.subject_id')
  })

  it('does not grant moderators administrator discovery exceptions', () => {
    const statement = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      isAdministrator: false,
    })

    expect(statement.text).toContain('candidate_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('publication_discovery_follow')
  })

  it('retains administrator clearance exceptions while enforcing discovery state', () => {
    const statement = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      isAdministrator: true,
    })

    expect(statement.text).not.toContain('approved_at')
    expect(statement.text).not.toContain('publication_discovery_follow')
    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
    expect(statement.text).toContain('publication_suspension.lifted_at IS NULL')
  })

  it('allows community-owned discovery readers to include archived community content', () => {
    const statement = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'access_post', {
      currentUserId: '00000000-0000-0000-0000-000000000001',
      includeArchivedCommunities: true,
      isAdministrator: false,
    })

    expect(statement.text).not.toContain('publication_community.archived_at')
    expect(statement.text).toContain('candidate_post.archived_at IS NULL')
  })
})
