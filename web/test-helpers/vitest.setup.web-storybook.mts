import { loadMessages } from '@ts-shared/ui-messages'
import { seedMessages } from '@/lib/i18n/use-translations'

// Pre-seeds the client-side translation cache before any story-related test renders a component,
// so `useTranslations()` resolves synchronously instead of suspending on the first mount. Mirrors
// the same seed in `web/test-helpers/vitest.setup.web.mts` (jsdom `web` project) and
// `web/.storybook/preview.tsx` (published Storybook) — this project has neither, so without this
// seed any codemod-migrated component transitively rendered here suspends on `loadMessages('en')`.
seedMessages('en', await loadMessages('en'))
