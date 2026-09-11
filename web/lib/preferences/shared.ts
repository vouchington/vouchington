export type Theme = 'light' | 'dark' | 'system'
export type ListStyle = 'card' | 'compact'
export type FeedStyle = 'compact' | 'summary'

export const THEME_COOKIE = 'theme'
export const LIST_STYLE_COOKIE = 'list-style'
export const FEED_STYLE_COOKIE = 'feed-style'
export const DEFAULT_THEME: Theme = 'dark'
export const DEFAULT_LIST_STYLE: ListStyle = 'card'
export const DEFAULT_FEED_STYLE: FeedStyle = 'summary'

export function isValidTheme(value: string): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function isValidListStyle(value: string): value is ListStyle {
  return value === 'card' || value === 'compact'
}

export function isValidFeedStyle(value: string): value is FeedStyle {
  return value === 'compact' || value === 'summary'
}
