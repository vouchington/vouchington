import { describe, expect, it } from 'vitest'
import { copyrightPlacementPublicVisibleSql } from './copyright-placement-public-visible-sql.mts'

describe('copyrightPlacementPublicVisibleSql', () => {
  it('asks each placement question as a bounded scalar subquery, never an EXISTS PostgreSQL can hash', () => {
    const { text } = copyrightPlacementPublicVisibleSql()

    // Inside an OR, EXISTS can become an uncorrelated hashed SubPlan that evaluates the post
    // eligibility view, or every surface owner, for the whole database on each execution (#2207).
    expect(text).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM image_(?:surface_)?placements/)
    expect(text).toMatch(
      /SELECT TRUE FROM image_placements binding[\s\S]+binding\.placement_id = target\.placement_id\s+LIMIT 1\s*\) IS TRUE OR \(\s*SELECT TRUE FROM image_surface_placements surface[\s\S]+surface\.placement_id = target\.placement_id[\s\S]+LIMIT 1\s*\) IS TRUE/,
    )
  })
})
