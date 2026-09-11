import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { StorybookConfig } from '@storybook/nextjs-vite'
import { buildStorybookAliases, transformWorkspaceMts } from './vite-config-helpers'

const config: StorybookConfig = {
  stories: ['../storybook/**/*.stories.{ts,tsx}'],
  addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-vitest')],
  framework: {
    name: getAbsolutePath('@storybook/nextjs-vite'),
    options: {},
  },
  async viteFinal(viteConfig) {
    const existingAlias = viteConfig.resolve?.alias ?? []
    const aliasArray = Array.isArray(existingAlias)
      ? existingAlias
      : Object.entries(existingAlias).map(([find, replacement]) => ({ find, replacement }))

    return {
      ...viteConfig,
      base: process.env.STORYBOOK_BASE_PATH ?? '/storybook/',
      plugins: [transformWorkspaceMts, ...(viteConfig.plugins ?? [])],
      optimizeDeps: {
        ...viteConfig.optimizeDeps,
        include: [...(viteConfig.optimizeDeps?.include ?? []), '@radix-ui/react-collapsible'],
      },
      resolve: {
        ...viteConfig.resolve,
        alias: buildStorybookAliases(aliasArray),
      },
      server: {
        ...viteConfig.server,
        // Crawl every story at dev-server startup so Vite discovers all deps before the
        // first Playwright fetch. Without this, incremental dep discovery triggers
        // "Re-optimizing because vite config has changed" mid-run, which restarts the
        // dev server and drops in-flight requests — causing sb-show-errordisplay and
        // stale ?v=<hash> 404s in the Playwright a11y suite.
        warmup: {
          ...viteConfig.server?.warmup,
          clientFiles: [
            ...(viteConfig.server?.warmup?.clientFiles ?? []),
            'storybook/**/*.stories.{ts,tsx}',
          ],
        },
      },
    }
  },
}

export default config

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)))
}
