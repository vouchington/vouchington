import { isbot } from 'isbot'

export type BotTier = 'known' | 'unknown'

export function isVerifiedBotRequest(request: Request): boolean {
  return (
    (request as Request & { cf?: { botManagement?: { verifiedBot?: boolean } } }).cf?.botManagement
      ?.verifiedBot === true
  )
}

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

// Returns the tier if isbot() detected a bot, or null for humans. Known-bot
// treatment requires a trusted platform signal; UA substrings alone are spoofable.
export const getBotTier = (
  userAgent: string | null,
  options: { verifiedBot?: boolean } = {},
): BotTier | null => {
  if (!userAgent || !isbot(userAgent)) {
    return null
  }

  const ua = userAgent.toLowerCase()
  const isKnown = KNOWN_BOT_UA_SUBSTRINGS.some(substring => ua.includes(substring.toLowerCase()))
  return isKnown && options.verifiedBot === true ? 'known' : 'unknown'
}
