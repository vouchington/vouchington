import { describe, expect, it } from 'vitest'
import type { UserWarningItem } from '@/lib/api/client/warnings'
import { projectMyWarnings } from './my-warnings-view-model'

const baseWarning: UserWarningItem = {
  id: 'warning-1',
  user_id: 'user-1',
  community_id: 'community-1',
  issued_by_id: 'moderator-1',
  issued_by_username: 'moderator',
  reason: 'Internal reason stays server-side',
  report_id: 'report-1',
  public_message: 'Visible message',
  created_at: '2026-05-31T00:00:00.000Z',
  community_slug: 'credit-cards',
}

describe('projectMyWarnings', () => {
  it('projects an empty warning list', () => {
    expect(projectMyWarnings([])).toEqual([])
  })

  it('projects one warning into the client view model', () => {
    expect(projectMyWarnings([baseWarning])).toEqual([
      {
        id: 'warning-1',
        communitySlug: 'credit-cards',
        createdAt: '2026-05-31T00:00:00.000Z',
        publicMessage: 'Visible message',
      },
    ])
  })

  it('projects multiple warnings in order', () => {
    expect(
      projectMyWarnings([
        baseWarning,
        {
          ...baseWarning,
          id: 'warning-2',
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'warning-1',
        communitySlug: 'credit-cards',
        createdAt: '2026-05-31T00:00:00.000Z',
        publicMessage: 'Visible message',
      },
      {
        id: 'warning-2',
        communitySlug: 'credit-cards',
        createdAt: '2026-06-01T00:00:00.000Z',
        publicMessage: 'Visible message',
      },
    ])
  })

  it('preserves nullable community slug and public message values', () => {
    expect(
      projectMyWarnings([
        {
          ...baseWarning,
          community_id: null,
          community_slug: null,
          public_message: null,
        },
      ]),
    ).toEqual([
      {
        id: 'warning-1',
        communitySlug: null,
        createdAt: '2026-05-31T00:00:00.000Z',
        publicMessage: null,
      },
    ])
  })
})
