import { nativeDotnetAuthMessages } from './auth.ts'
import { nativeDotnetChatConversationMessages } from './chat-conversation.ts'
import { nativeDotnetChatListMessages } from './chat-list.ts'
import { nativeDotnetDirectMessagesMessages } from './direct-messages.ts'
import { nativeDotnetDynamicMessages } from './dynamic.ts'
import { nativeDotnetEngineeringMessages } from './engineering.ts'
import { nativeDotnetEngineeringPostgresqlMessages } from './engineering-postgresql.ts'
import { nativeDotnetEngineeringQueuesMessages } from './engineering-queues.ts'
import { nativeDotnetEngineeringValkeyMessages } from './engineering-valkey.ts'
import { nativeDotnetGrowthEnEsMessages } from './growth-en-es.ts'
import { nativeDotnetLandingPagesMessages } from './landing-pages.ts'
import { nativeDotnetListsMessages } from './lists.ts'
import { nativeDotnetPaymentCardsMessages } from './payment-cards.ts'
import { nativeDotnetMediaPlaybackMessages } from './media-playback.ts'
import { nativeDotnetModerationMessages } from './moderation.ts'
import { nativeDotnetNewsFeedsMessages } from './news-feeds.ts'
import { nativeDotnetNotificationsMessages } from './notifications.ts'
import { nativeDotnetOmnisearchMessages } from './omnisearch.ts'
import { nativeDotnetResidualEsMessages } from './residual-es.ts'
import { nativeDotnetPostComposeMessages } from './post-compose.ts'
import { nativeDotnetPostDetailMessages } from './post-detail.ts'
import { nativeDotnetPostsMessages } from './posts.ts'
import { nativeDotnetProfileMessages } from './profile.ts'
import { nativeDotnetReferralLinksMessages } from './referral-links.ts'
import { nativeDotnetSettingsMessages } from './settings.ts'
import { nativeDotnetSupportMessages } from './support.ts'
import { nativeDotnetTopicManagementMessages } from './topic-management.ts'
import { nativeDotnetTopicsMessages } from './topics.ts'
import { nativeDotnetTopHashtagsMessages } from './top-hashtags.ts'
import { nativeDotnetTurnstileMessages } from './turnstile.ts'
import { nativeDotnetCsharpEnEsFrMessages } from './csharp-en-es-fr.ts'
import { nativeDotnetCsharpCommunitiesEsMessages } from './csharp-communities-es.ts'
import { nativeDotnetCsharpCrmMessages } from './csharp-crm.ts'
import { nativeDotnetCsharpDialogsEnEsMessages } from './csharp-dialogs-en-es.ts'
import { nativeDotnetCsharpEditorMessages } from './csharp-editor.ts'
import { nativeDotnetCsharpStatusMessages } from './csharp-status.ts'
import { nativeDotnetCsharpTagsMessages } from './csharp-tags.ts'
import { nativeDotnetCsharpVerificationMessages } from './csharp-verification.ts'
import { nativeDotnetCommonMessages } from './common.ts'
import { nativeDotnetFriendsMessages } from './friends.ts'
import { nativeDotnetModerationRebasedMessages } from './moderation-rebased.ts'

export const nativeDotnetEsMessages = {
  auth: nativeDotnetAuthMessages.es,
  chatConversation: nativeDotnetChatConversationMessages.es,
  chatList: nativeDotnetChatListMessages.es,
  directMessages: nativeDotnetDirectMessagesMessages.es,
  dynamic: nativeDotnetDynamicMessages.es,
  engineering: nativeDotnetEngineeringMessages.es,
  engineeringPostgresql: nativeDotnetEngineeringPostgresqlMessages.es,
  engineeringQueues: nativeDotnetEngineeringQueuesMessages.es,
  engineeringValkey: nativeDotnetEngineeringValkeyMessages.es,
  growth: nativeDotnetGrowthEnEsMessages.es,
  landingPages: nativeDotnetLandingPagesMessages.es,
  lists: nativeDotnetListsMessages.es,
  paymentCards: nativeDotnetPaymentCardsMessages.es,
  mediaPlayback: nativeDotnetMediaPlaybackMessages.es,
  moderation: nativeDotnetModerationMessages.es,
  newsFeeds: nativeDotnetNewsFeedsMessages.es,
  notifications: nativeDotnetNotificationsMessages.es,
  omnisearch: nativeDotnetOmnisearchMessages.es,
  residual: nativeDotnetResidualEsMessages.es,
  postCompose: nativeDotnetPostComposeMessages.es,
  postDetail: nativeDotnetPostDetailMessages.es,
  posts: nativeDotnetPostsMessages.es,
  profile: nativeDotnetProfileMessages.es,
  referralLinks: nativeDotnetReferralLinksMessages.es,
  settings: nativeDotnetSettingsMessages.es,
  support: nativeDotnetSupportMessages.es,
  topHashtags: nativeDotnetTopHashtagsMessages.es,
  topicManagement: nativeDotnetTopicManagementMessages.es,
  topics: nativeDotnetTopicsMessages.es,
  turnstile: nativeDotnetTurnstileMessages.es,
  csharp: nativeDotnetCsharpEnEsFrMessages.es,
  csharpCommunities: nativeDotnetCsharpCommunitiesEsMessages.es,
  csharpCrm: nativeDotnetCsharpCrmMessages.es,
  csharpDialogs: nativeDotnetCsharpDialogsEnEsMessages.es,
  csharpEditor: nativeDotnetCsharpEditorMessages.es,
  csharpStatus: nativeDotnetCsharpStatusMessages.es,
  csharpTags: nativeDotnetCsharpTagsMessages.es,
  csharpVerification: nativeDotnetCsharpVerificationMessages.es,
  common: nativeDotnetCommonMessages.es,
  friends: nativeDotnetFriendsMessages.es,
  moderationRebased: nativeDotnetModerationRebasedMessages.es,
} as const
