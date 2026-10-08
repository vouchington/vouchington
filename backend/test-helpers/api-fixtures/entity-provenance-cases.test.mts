import { describe, expect, it } from 'vitest'
import { entityProvenanceApiFixtureCases } from './entity-provenance-cases.mts'

describe('community provenance response fixtures', () => {
  it.each(['entity-provenance.communities', 'entity-provenance.communities.staff'])(
    '%s uses the actual communities response sidecar',
    id => {
      const fixture = entityProvenanceApiFixtureCases.find(candidate => candidate.id === id)
      expect(fixture?.body).toHaveProperty('communities.community-1-mcp.provenance.via', 'mcp')
      expect(fixture?.body).toHaveProperty('communities.community-1-api.provenance.via', 'api')
      expect(fixture?.body).not.toHaveProperty('communitys')
    },
  )
})
