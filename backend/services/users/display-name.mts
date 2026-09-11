export function getUserDisplayName(user: {
  username?: string
  display_account?: { name?: string | null } | null
}): string {
  return user.display_account?.name ?? user.username ?? ''
}
