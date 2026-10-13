import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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

  it('patches the installed Storybook app-router decorator when the field is missing', () => {
    const require = createRequire(import.meta.url)
    const previewPath = require.resolve('@storybook/nextjs-vite/preview')
    const chunkDir = join(dirname(previewPath), '_browser-chunks')
    const provider = readdirSync(chunkDir)
      .filter(name => name.endsWith('.js'))
      .map(name => readFileSync(join(chunkDir, name), 'utf8'))
      .find(source => source.includes('LayoutRouterContext') && source.includes('parentCacheNode:'))

    expect(provider).toEqual(expect.any(String))
    const source = provider ?? ''
    const missing = !source.includes('parentRenderTree')
    const patched = addStorybookParentRenderTree(source) ?? source
    expect(patched.includes('parentRenderTree:{data:{bfcacheId:0}},parentCacheNode:')).toBe(missing)
    expect(patched).toContain('parentRenderTree')
    expect(patched).toContain('parentCacheNode:')
  })
})
