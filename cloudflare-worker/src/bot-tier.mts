import { createBotTierClassifier } from '@vouchington/edge'
import { isbot } from 'isbot'

export type BotTier = 'known' | 'unknown'

// Substrings that identify known, useful bots.
// Any case-insensitive match against the User-Agent string means 'known'.
const KNOWN_BOT_UA_SUBSTRINGS: string[] = [
  // Search engines
  'Googlebot',
  'Google-InspectionTool',
  'Storebot-Google',
  'GoogleOther',
  'Bingbot',
  'msnbot',
  'YandexBot',
  'Baiduspider',
  'DuckDuckBot',
  'Applebot',
  'Slurp',
  'ia_archiver',
  // AI search engines
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'anthropic-ai',
  'Amazonbot',
  // Social previewers
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'WhatsApp',
  'TelegramBot',
  // Monitoring
  'UptimeRobot',
  'Pingdom',
  'Site24x7',
  'StatusCake',
  'BetterUptime',
]

export const getBotTier = createBotTierClassifier<'known', 'unknown'>({
  isBot: isbot,
  knownUserAgentSubstrings: KNOWN_BOT_UA_SUBSTRINGS,
  knownTier: 'known',
  unknownTier: 'unknown',
})
