// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import { buildStorybookAliases } from './vite-config-helpers'

const webRoot = fileURLToPath(new URL('../', import.meta.url))
const importer = fileURLToPath(
  new URL('../components/posts/post-detail-aside.tsx', import.meta.url),
)

async function withStorybookResolver(
  action: (server: Awaited<ReturnType<typeof createServer>>) => Promise<void>,
) {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: webRoot,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: buildStorybookAliases([{ find: '@', replacement: webRoot }]) },
  })
  let primary: unknown
  let failed = false
  let cleanup: unknown
  let cleanupFailed = false
  try {
    await action(server)
  } catch (err) {
    primary = err
    failed = true
  }
  try {
    await server.close()
  } catch (err) {
    cleanup = err
    cleanupFailed = true
  }
  if (failed) {
    if (cleanupFailed)
      throw new AggregateError([primary, cleanup], 'Resolution assertion and Vite cleanup failed', {
        cause: primary,
      })
    throw primary
  }
  if (cleanupFailed) throw cleanup
}

describe('published Storybook post aside resolution', () => {
  it('resolves every async data boundary to the synchronous fixture', async () => {
    await withStorybookResolver(async server => {
      const fixture = fileURLToPath(
        new URL('../storybook/mocks/post-detail-asides.tsx', import.meta.url),
      )
      for (const specifier of [
        '@/components/posts/post-follow-context',
        '@/components/posts/post-review-referral-links-aside',
        '@/components/tags/post-related-topics-aside',
        '@/components/tags/post-related-posts-aside',
        '@/components/tags/post-related-urls-aside',
        '@/components/asides/hn-discussions-post-aside',
      ]) {
        const resolved = await server.pluginContainer.resolveId(specifier, importer)
        expect(resolved?.id).toBe(fixture)
      }
    })
  })

  it('retains real synchronous content and the existing PostDetail fixture', async () => {
    await withStorybookResolver(async server => {
      const content = await server.pluginContainer.resolveId(
        '@/components/tags/post-related-topics-aside-content',
        importer,
      )
      expect(content?.id).toBe(
        fileURLToPath(
          new URL('../components/tags/post-related-topics-aside-content.tsx', import.meta.url),
        ),
      )
      const detail = await server.pluginContainer.resolveId(
        '@/components/posts/post-detail',
        importer,
      )
      expect(detail?.id).toBe(
        fileURLToPath(new URL('../storybook/mocks/post-detail.tsx', import.meta.url)),
      )
    })
  })
})
