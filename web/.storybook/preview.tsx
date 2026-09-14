import type { Preview } from '@storybook/nextjs-vite'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'

import '../app/globals.css'
import { seedMessages } from '@/lib/i18n/use-translations'
import { StorybookProviders } from '../storybook/entities/storybook-providers'

// Pre-seeds the client-side translation cache before any story renders, so `useTranslations()`
// resolves synchronously instead of suspending on the first mount. Without this, any story
// rendering a codemod-migrated component suspends on `loadJsonMessages('en')` — fine under the
// ratchet grid's shared `<Suspense>` wrapper, but a bespoke story with a play-function assertion
// that reads text immediately after mount has no such wrapper and would flake against the
// unresolved promise. Assemble committed catalog JSON here, not `locale-loader` or the
// production API client: those pull async RSC asides or `'use client'` request singletons into
// the Storybook graph. 'en' is hardcoded (not `DEFAULT_UI_LOCALE`)
// because `@ts-shared/languages/ui-locales` is aliased to a storybook-only mock in the browser
// Vitest project; every story here already renders English.
seedMessages('en', await loadJsonMessages('en'))

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <StorybookProviders currentUser={context.parameters.auth?.currentUser}>
        <Story />
      </StorybookProviders>
    ),
  ],
  parameters: {
    a11y: {
      test: 'error',
      options: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
      },
    },
    layout: 'fullscreen',
    controls: { expanded: true },
    docs: { autodocs: false },
    nextjs: {
      appDirectory: true,
      image: { unoptimized: true },
      navigation: {
        pathname: '/storybook',
        query: {},
      },
    },
  },
}

export default preview
