import { describe, expect, it } from 'vitest'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import selectors from '../../test-helpers/mcp-route-selectors.json' with { type: 'json' }
import { toolRouteCharges } from './tool-route-keys.mts'

// Only the discriminator is needed by selectApi; dispatch separately validates the complete input.
describe('pinned argument selectors for REST-twin charges', () => {
  it.each(selectors)('$tool routes $arguments to $routes', row => {
    const tool = getRegisteredToolByName(row.tool)
    expect(tool).toBeDefined()
    expect(
      toolRouteCharges(tool!.meta, row.arguments)
        .flatMap(charge => charge.routeKeys)
        .toSorted(),
    ).toEqual(row.routes.toSorted())
  })
})
