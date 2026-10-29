import { describe, expect, it } from 'vitest'
import { supplyStorybookParentRenderTree } from '../../.storybook/vite-config-helpers'

const transform: OmitThisParameter<typeof supplyStorybookParentRenderTree.transform> =
  supplyStorybookParentRenderTree.transform

const frameworkId = '/node_modules/@storybook/nextjs-vite/dist/app-router-provider.js'

describe('Storybook parent render tree', () => {
  it('inserts parentRenderTree beside parentCacheNode', () => {
    const source = 'LayoutRouterContext.Provider,{value:{parentCacheNode:node,url:"/"}}'

    expect(transform(source, frameworkId)?.code).toBe(
      'LayoutRouterContext.Provider,{value:{parentRenderTree:{data:{bfcacheId:0}},parentCacheNode:node,url:"/"}}',
    )
  })

  it('ignores matching text in an application module', () => {
    expect(transform('LayoutRouterContext parentCacheNode:node', '/src/app/page.tsx')).toBeNull()
  })

  it('leaves a decorator that already provides parentRenderTree unchanged', () => {
    const source = 'LayoutRouterContext parentRenderTree:tree,parentCacheNode:node'

    expect(transform(source, frameworkId)).toBeNull()
  })
})
