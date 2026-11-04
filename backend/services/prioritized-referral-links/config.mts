/** Newest votes read when finding authors the viewer rated positively. */
export const RECENT_VOTE_LIMIT = 1000

/**
 * `priority_group` values: 1-4 are the viewer's network groups (see network-groups.mts), so the
 * official links rank after every personalized group and before everyone else. 5 only ever means
 * official, and 6 is every other link, including the unranked "show all" list.
 */
export const OFFICIAL_PRIORITY_GROUP = 5
export const EVERYONE_ELSE_PRIORITY_GROUP = 6

export const DEFAULT_ALL_LINKS_PAGE_LIMIT = 25
export const MAX_ALL_LINKS_PAGE_LIMIT = 100
