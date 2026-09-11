import { nativeDotnetEnMessages } from './native-dotnet/en.ts'
import { nativeDotnetEsMessages } from './native-dotnet/es.ts'
import { nativeDotnetFrMessages } from './native-dotnet/fr.ts'
import { nativeDotnetPtMessages } from './native-dotnet/pt.ts'
import { nativeDotnetAuthSurfaceMessages } from './native-dotnet/auth-surface.ts'
import { nativeDotnetBookmarksSurfaceMessages } from './native-dotnet/bookmarks-surface.ts'
import { nativeDotnetCommunitySurfaceMessages } from './native-dotnet/community-surface.ts'
import { nativeDotnetCrmSurfaceMessages } from './native-dotnet/crm-surface.ts'
import { nativeDotnetDirectMessagesSurfaceMessages } from './native-dotnet/direct-messages-surface.ts'
import { nativeDotnetMediaPlaybackSurfaceMessages } from './native-dotnet/media-playback-surface.ts'
import { nativeDotnetPostsSurfaceMessages } from './native-dotnet/posts-surface.ts'
import { nativeDotnetProfileSurfaceMessages } from './native-dotnet/profile-surface.ts'
import { nativeDotnetReferralLinksSurfaceMessages } from './native-dotnet/referral-links-surface.ts'
import { nativeDotnetSettingsSurfaceMessages } from './native-dotnet/settings-surface.ts'
import { nativeDotnetTagManagementSurfaceMessages } from './native-dotnet/tag-management-surface.ts'
import { nativeDotnetValidationSurfaceMessages } from './native-dotnet/validation-surface.ts'

export const nativeDotnetMessages = {
  en: withSurfaceMessages(nativeDotnetEnMessages, 'en'),
  es: withSurfaceMessages(nativeDotnetEsMessages, 'es'),
  fr: withSurfaceMessages(nativeDotnetFrMessages, 'fr'),
  pt: withSurfaceMessages(nativeDotnetPtMessages, 'pt'),
} as const

function withSurfaceMessages(catalog: Record<string, unknown>, locale: 'en' | 'es' | 'fr' | 'pt') {
  return {
    ...catalog,
    auth: { ...(catalog.auth as object), ...nativeDotnetAuthSurfaceMessages[locale] },
    bookmarks: nativeDotnetBookmarksSurfaceMessages[locale],
    community: nativeDotnetCommunitySurfaceMessages[locale],
    crm: nativeDotnetCrmSurfaceMessages[locale],
    directMessages: {
      ...(catalog.directMessages as object),
      ...nativeDotnetDirectMessagesSurfaceMessages[locale],
    },
    mediaPlayback: {
      ...(catalog.mediaPlayback as object),
      ...nativeDotnetMediaPlaybackSurfaceMessages[locale],
    },
    posts: { ...(catalog.posts as object), ...nativeDotnetPostsSurfaceMessages[locale] },
    profile: { ...(catalog.profile as object), ...nativeDotnetProfileSurfaceMessages[locale] },
    referralLinks: {
      ...(catalog.referralLinks as object),
      ...nativeDotnetReferralLinksSurfaceMessages[locale],
    },
    settings: {
      ...(catalog.settings as object),
      ...nativeDotnetSettingsSurfaceMessages[locale],
    },
    tagManagement: nativeDotnetTagManagementSurfaceMessages[locale],
    validation: nativeDotnetValidationSurfaceMessages[locale],
  }
}
