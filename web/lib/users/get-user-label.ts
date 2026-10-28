type LabelledUser = {
  display_account?: { name?: string | null } | null
  username?: string | null
}

export function getUserLabel(
  user: LabelledUser | null | undefined,
  deletedUserLabel: string,
): string {
  return user?.display_account?.name || user?.username || deletedUserLabel
}
