import { describe, expect, it } from 'vitest'
import { addStorybookParentRenderTree } from '../../.storybook/vite-config-helpers'

describe('Storybook parent render tree', () => {
  it('inserts parentRenderTree beside parentCacheNode', () => {
    const source = 'LayoutRouterContext.Provider,{value:{parentCacheNode:node,url:"/"}}'

    expect(addStorybookParentRenderTree(source)).toBe(
      'LayoutRouterContext.Provider,{value:{parentRenderTree:{data:{bfcacheId:0}},parentCacheNode:node,url:"/"}}',
    )
  })

  it('leaves a decorator that already provides parentRenderTree unchanged', () => {
    const source = 'LayoutRouterContext parentRenderTree:tree,parentCacheNode:node'

    expect(addStorybookParentRenderTree(source)).toBeNull()
  })
})
