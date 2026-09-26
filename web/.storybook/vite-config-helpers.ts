import { fileURLToPath } from 'node:url'
import { transformWithOxc, type Alias, type Plugin } from 'vite'

export const transformWorkspaceMts = {
  name: 'transform-workspace-mts',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.includes('/ts-shared/') || !id.endsWith('.mts')) return null

    return transformWithOxc(code, id, {
      lang: 'ts',
      target: 'es2022',
    })
  },
} satisfies Plugin

/**
 * Storybook-only Vite aliases that stub out async Server Components (which React 19
 * cannot render client-side) and components that reach live/authenticated client APIs
 * on mount, keeping stories deterministic. Workspace-resolved aliases (e.g. `@ts-shared/*`)
 * are appended last via `workspaceAliases` so they don't shadow these overrides.
 */
export function buildStorybookAliases(workspaceAliases: Alias[]): Alias[] {
  return [
    {
      // AnonymousStructuredDataScript is an async Server Component (calls next/headers).
      // React 19 cannot render async components client-side, so stub it to null.
      find: '@/components/seo/anonymous-structured-data-script',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/anonymous-structured-data-script.ts', import.meta.url),
      ),
    },
    {
      // TrendingTopicsAside is an async Server Component that reaches next/headers via server API helpers.
      find: '@/components/asides/trending-topics-aside',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/trending-topics-aside.tsx', import.meta.url),
      ),
    },
    {
      // CommunitiesSidebarGroup loads client API data on mount; keep ratchet stories deterministic.
      find: '@/components/communities/communities-sidebar-group',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/communities-sidebar-group.tsx', import.meta.url),
      ),
    },
    {
      // InboxButton opens live client state and notifications APIs; keep ratchet stories inert.
      find: '@/components/notifications/inbox-button',
      replacement: fileURLToPath(new URL('../storybook/mocks/inbox-button.tsx', import.meta.url)),
    },
    {
      // ModmailInbox reaches client APIs on mount; keep ratchet stories inert.
      find: '@/components/communities/modmail-inbox',
      replacement: fileURLToPath(new URL('../storybook/mocks/modmail-inbox.tsx', import.meta.url)),
    },
    {
      // UserModNotesPanel expects fixture props before loading moderation context.
      find: '@/components/moderation/user-mod-notes-panel',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/user-mod-notes-panel.tsx', import.meta.url),
      ),
    },
    {
      // ListsSidebarGroup loads authenticated list API data on mount.
      find: '@/components/lists/lists-sidebar-group',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/lists-sidebar-group.tsx', import.meta.url),
      ),
    },
    {
      // FollowButton can delegate to bookmark client APIs without fixture props.
      find: '@/components/shared/follow-button',
      replacement: fileURLToPath(new URL('../storybook/mocks/follow-button.tsx', import.meta.url)),
    },
    {
      // StatusPage is an async Server Component (calls getTranslations(), which reaches
      // next/headers). React 19 cannot render async components client-side, so stub it
      // with a synchronous fixture mirroring the real JSX/labels.
      find: '@/components/shared/status-page',
      replacement: fileURLToPath(new URL('../storybook/mocks/status-page.tsx', import.meta.url)),
    },
    {
      // FeedPageHeader is an async Server Component (calls getTranslations(), which
      // reaches next/headers). React 19 cannot render async components client-side, so
      // stub it with a synchronous fixture mirroring the real JSX/labels.
      find: '@/components/feed/feed-page-header',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/feed-page-header.tsx', import.meta.url),
      ),
    },
    ...[
      '@/components/tags/topic-category-tags-aside',
      '@/components/tags/topic-publisher-types-aside',
    ].map(find => ({
      // These async Server Components reach next/headers via server API helpers.
      find,
      replacement: fileURLToPath(
        new URL('../storybook/mocks/topic-tag-asides.tsx', import.meta.url),
      ),
    })),
    {
      // EditPostPage is an async Server Component that reaches auth/server API helpers.
      find: '@/components/posts/edit-post-page',
      replacement: fileURLToPath(new URL('../storybook/mocks/edit-post-page.tsx', import.meta.url)),
    },
    {
      // ManagePostTags imports async tag management internals that reach server API helpers.
      find: '@/components/tags/manage-post-tags',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/manage-post-tags.tsx', import.meta.url),
      ),
    },
    {
      // ValidationsListTable is an async Server Component (calls getTranslations(), which
      // reaches next/headers). React 19 cannot render async components client-side, so stub it.
      find: '@/components/admin/referral-link-validations/validations-list-table',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/validations-list-table.tsx', import.meta.url),
      ),
    },
    {
      // ReferralValidationsSettings is an async Server Component (calls getTranslations(),
      // which reaches next/headers). React 19 cannot render async components client-side, so
      // stub it.
      find: '@/components/topics/settings/referral-validations-settings',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/referral-validations-settings.tsx', import.meta.url),
      ),
    },
    {
      // ApiKeysManager performs authenticated client API requests on mount.
      find: /^@\/components\/my\/api-keys-manager$/,
      replacement: fileURLToPath(
        new URL('../storybook/mocks/api-keys-manager.tsx', import.meta.url),
      ),
    },
    {
      find: '@/hooks/use-turnstile-token',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/use-turnstile-token.ts', import.meta.url),
      ),
    },
    {
      find: '@/lib/utils/assert-proxied-image-src',
      replacement: fileURLToPath(
        new URL('../storybook/mocks/assert-proxied-image-src.ts', import.meta.url),
      ),
    },
    {
      find: 'next/headers',
      replacement: fileURLToPath(new URL('../storybook/mocks/next-headers.ts', import.meta.url)),
    },
    {
      find: 'next/script',
      replacement: fileURLToPath(new URL('../storybook/mocks/next-script.tsx', import.meta.url)),
    },
    {
      // Provider buttons load Apple, Facebook, and Google scripts when client IDs are set.
      find: /^@\/hooks\/use-(apple|github|google|linkedin|microsoft|x)-auth$|^@\/hooks\/use-facebook-sdk$/,
      replacement: fileURLToPath(
        new URL('../storybook/mocks/oauth-provider-auth.ts', import.meta.url),
      ),
    },
    ...(
      [
        ['@/lib/i18n/get-translations', 'get-translations.ts'],
        ['@/lib/i18n/load-server-messages', 'load-server-messages.ts'],
        ['@/lib/i18n/get-resolved-ui-locale', 'get-resolved-ui-locale.ts'],
      ] as const
    ).map(([find, file]) => ({
      // These reach next/headers / server-only. Keep them out of the Storybook browser graph.
      find,
      replacement: fileURLToPath(new URL(`../storybook/mocks/${file}`, import.meta.url)),
    })),
    ...workspaceAliases,
  ]
}
