// no-mistakes-disable-file test-no-unmocked-dynamic-imports: these branches load only pure locale-catalog data modules.
import type { EnCatalog } from './index.mts'

async function loadLocaleChunks(locale: 'en' | 'es' | 'fr' | 'pt'): Promise<EnCatalog> {
  switch (locale) {
    case 'en': {
      const [core, admin, account, content, community, commerce, platform, misc] =
        await Promise.all([
          import('./messages/en/core.ts'),
          import('./messages/en/extracted-admin.ts'),
          import('./messages/en/extracted-account.ts'),
          import('./messages/en/extracted-content.ts'),
          import('./messages/en/extracted-community.ts'),
          import('./messages/en/extracted-commerce.ts'),
          import('./messages/en/extracted-platform.ts'),
          import('./messages/en/extracted-misc.ts'),
        ])
      return mergeLocaleChunks(
        core.default,
        admin.default,
        account.default,
        content.default,
        community.default,
        commerce.default,
        platform.default,
        misc.default,
      )
    }
    case 'es': {
      const [core, admin, account, content, community, commerce, platform, misc] =
        await Promise.all([
          import('./messages/es/core.ts'),
          import('./messages/es/extracted-admin.ts'),
          import('./messages/es/extracted-account.ts'),
          import('./messages/es/extracted-content.ts'),
          import('./messages/es/extracted-community.ts'),
          import('./messages/es/extracted-commerce.ts'),
          import('./messages/es/extracted-platform.ts'),
          import('./messages/es/extracted-misc.ts'),
        ])
      return mergeLocaleChunks(
        core.default,
        admin.default,
        account.default,
        content.default,
        community.default,
        commerce.default,
        platform.default,
        misc.default,
      )
    }
    case 'fr': {
      const [core, admin, account, content, community, commerce, platform, misc] =
        await Promise.all([
          import('./messages/fr/core.ts'),
          import('./messages/fr/extracted-admin.ts'),
          import('./messages/fr/extracted-account.ts'),
          import('./messages/fr/extracted-content.ts'),
          import('./messages/fr/extracted-community.ts'),
          import('./messages/fr/extracted-commerce.ts'),
          import('./messages/fr/extracted-platform.ts'),
          import('./messages/fr/extracted-misc.ts'),
        ])
      return mergeLocaleChunks(
        core.default,
        admin.default,
        account.default,
        content.default,
        community.default,
        commerce.default,
        platform.default,
        misc.default,
      )
    }
    case 'pt': {
      const [core, admin, account, content, community, commerce, platform, misc] =
        await Promise.all([
          import('./messages/pt/core.ts'),
          import('./messages/pt/extracted-admin.ts'),
          import('./messages/pt/extracted-account.ts'),
          import('./messages/pt/extracted-content.ts'),
          import('./messages/pt/extracted-community.ts'),
          import('./messages/pt/extracted-commerce.ts'),
          import('./messages/pt/extracted-platform.ts'),
          import('./messages/pt/extracted-misc.ts'),
        ])
      return mergeLocaleChunks(
        core.default,
        admin.default,
        account.default,
        content.default,
        community.default,
        commerce.default,
        platform.default,
        misc.default,
      )
    }
  }
}

function mergeLocaleChunks(
  core: Omit<EnCatalog, 'extracted'>,
  ...extractedChunks: Array<Partial<EnCatalog['extracted']>>
): EnCatalog {
  return {
    ...core,
    extracted: Object.assign({}, ...extractedChunks),
  } as EnCatalog
}

/**
 * Resolves the message catalog for a given locale via explicit namespace imports over the known
 * locales (literal `import()` calls, not template-string dynamic imports, so bundlers/Next.js can
 * code-split reliably). Falls back to `en` for any unrecognized value.
 */
export async function loadMessages(locale: string): Promise<EnCatalog> {
  switch (locale) {
    case 'en':
      return loadLocaleChunks('en')
    case 'es':
      return loadLocaleChunks('es')
    case 'fr':
      return loadLocaleChunks('fr')
    case 'pt':
      return loadLocaleChunks('pt')
    default:
      return loadLocaleChunks('en')
  }
}
