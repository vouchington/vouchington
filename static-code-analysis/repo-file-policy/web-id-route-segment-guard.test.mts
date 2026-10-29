import { describe, expect, it } from 'vitest'

import { checkWebIdRouteSegments, collectIdRouteSegments } from './web-id-route-segment-guard.mts'

function check(files: string[], allowlist: Array<[string, string]>): string[] {
  const errors: string[] = []
  checkWebIdRouteSegments(files, errors, new Map(allowlist))
  return errors
}

describe('web id route segment guard', () => {
  it('collects id-looking segments with route groups removed and ignores slug params', () => {
    expect(
      [
        ...collectIdRouteSegments([
          'web/app/(lists)/list/[id]/page.tsx',
          'web/app/(posts)/article/[id]/comment/[commentId]/page.tsx',
          'web/app/api/thing/[thing_id]/route.ts',
          'web/app/user/[idOrUsername]/page.tsx',
          'web/app/communities/[slug]/page.tsx',
          'web/lib/not-a-route/[id]/page.tsx',
        ]),
      ].toSorted(),
    ).toEqual([
      '/api/thing/[thing_id]',
      '/article/[id]',
      '/article/[id]/comment/[commentId]',
      '/list/[id]',
    ])
  })

  it('rejects an id segment that is not allowlisted', () => {
    const errors = check(['web/app/widget/[widgetId]/page.tsx'], [])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('web/app route /widget/[widgetId] routes by an id')
  })

  it('accepts an allowlisted id segment', () => {
    expect(
      check(['web/app/(lists)/list/[id]/page.tsx'], [['/list/[id]', 'lists have no natural key']]),
    ).toEqual([])
  })

  it('rejects an allowlist entry whose route is gone', () => {
    const errors = check(
      ['web/app/(lists)/list/[id]/page.tsx'],
      [
        ['/list/[id]', 'lists have no natural key'],
        ['/gone/[id]', 'removed'],
      ],
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('stale web id route allowlist entry /gone/[id]')
  })

  it('does nothing when the repository has no web app', () => {
    expect(check(['backend/index.mts'], [['/list/[id]', 'x']])).toEqual([])
  })
})
