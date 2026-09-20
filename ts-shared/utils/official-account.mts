export const OFFICIAL_ROLE_SLUGS = new Set(['administrator', 'investor', 'customer_support'])

export const SYSTEM_USERNAMES = new Set([
  'system',
  'autotagger',
  'customer-support',
  'rss-feed-auto-updater',
  'story-teller',
  'voucha',
])

export function isOfficialAccount(
  user: { roles?: readonly string[]; is_agent?: boolean; username?: string } | null | undefined,
): boolean {
  if (!user) return false
  if (user.roles?.some(role => OFFICIAL_ROLE_SLUGS.has(role))) return true
  if (user.is_agent === true) return true
  return user.username ? SYSTEM_USERNAMES.has(user.username) : false
}
