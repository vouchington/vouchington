import type { SQLStatement } from 'sql-template-strings'
import type { PrioritizedReferralLink, ReferralLinksWithUsers, ReferralLinkUser } from './types.mts'

/** Appends the user columns every ranked read returns beside each link. */
export function appendLinkUserJoin(query: SQLStatement, linksCte: string): void {
  query.append(`
SELECT l.*, vup.username, vup.account_type, vup.display_account->>'name' AS user_display_name
FROM ${linksCte} l
LEFT JOIN view_users_public vup ON vup.id = l.user_id`)
}

export type LinkRow = PrioritizedReferralLink & {
  username: string | null
  account_type: ReferralLinkUser['account_type'] | null
  user_display_name: string | null
}

export function toLinksWithUsers(rows: LinkRow[]): ReferralLinksWithUsers {
  const users: Record<string, ReferralLinkUser> = {}
  const links = rows.map(({ username, account_type, user_display_name, ...link }) => {
    if (link.user_id && username && !users[link.user_id]) {
      users[link.user_id] = {
        id: link.user_id,
        username,
        account_type: account_type as ReferralLinkUser['account_type'],
        display_name: user_display_name ?? null,
      }
    }
    return link
  })
  return { links, users }
}

export function filterLinks(
  source: ReferralLinksWithUsers,
  keep: (link: PrioritizedReferralLink) => boolean,
): ReferralLinksWithUsers {
  const links = source.links.filter(keep)
  const users: Record<string, ReferralLinkUser> = {}
  for (const link of links) {
    const user = link.user_id ? source.users[link.user_id] : undefined
    if (user) users[user.id] = user
  }
  return { links, users }
}
