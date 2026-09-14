import { resolve } from 'node:path'

const storybookMock = (file: string): string => resolve(process.cwd(), 'web/storybook/mocks', file)

const storybookMockAliases = {
  '@/components/admin/referral-link-validations/validations-list-table':
    'validations-list-table.tsx',
  '@/components/agents/agent-detail': 'agent-detail.tsx',
  '@/components/asides/trending-topics-aside': 'trending-topics-aside.tsx',
  '@/components/communities/communities-sidebar-group': 'communities-sidebar-group.tsx',
  '@/components/communities/modmail-inbox': 'modmail-inbox.tsx',
  '@/components/feed/feed-page-header': 'feed-page-header.tsx',
  '@/components/lists/lists-sidebar-group': 'lists-sidebar-group.tsx',
  '@/components/posts/edit-post-page': 'edit-post-page.tsx',
  '@/components/seo/anonymous-structured-data-script': 'anonymous-structured-data-script.ts',
  '@/components/shared/follow-button': 'follow-button.tsx',
  '@/components/shared/status-page': 'status-page.tsx',
  '@/components/tags/manage-post-tags': 'manage-post-tags.tsx',
  '@/components/tags/topic-category-tags-aside': 'topic-tag-asides.tsx',
  '@/components/tags/topic-publisher-types-aside': 'topic-tag-asides.tsx',
  '@/components/moderation/user-mod-notes-panel': 'user-mod-notes-panel.tsx',
  '@/components/notifications/inbox-button': 'inbox-button.tsx',
  '@/components/topics/settings/referral-validations-settings': 'referral-validations-settings.tsx',
  '@/hooks/use-turnstile-token': 'use-turnstile-token.ts',
  '@/lib/i18n/get-resolved-ui-locale': 'get-resolved-ui-locale.ts',
  '@/lib/i18n/get-translations': 'get-translations.ts',
  '@/lib/i18n/load-server-messages': 'load-server-messages.ts',
  'next/script': 'next-script.tsx',
} as const

export const storybookMockResolveAliases: Array<{ find: string | RegExp; replacement: string }> = [
  ...['content-languages', 'open-graph', 'select-options', 'ui-locales'].map(name => ({
    find: `@ts-shared/languages/${name}`,
    replacement: storybookMock('languages.ts'),
  })),
  ...Object.entries(storybookMockAliases).map(([find, file]) => ({
    find,
    replacement: storybookMock(file),
  })),
  {
    find: /^@\/components\/my\/api-keys-manager$/,
    replacement: storybookMock('api-keys-manager.tsx'),
  },
  { find: 'next/image', replacement: storybookMock('next-image.tsx') },
  { find: 'next/headers', replacement: storybookMock('next-headers.ts') },
]
