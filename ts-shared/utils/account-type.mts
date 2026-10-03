export type AccountType = 'official' | 'system' | 'ai_agent' | null

/** Platform accounts cannot contribute member trust signals. */
export function isPlatformAccount(
  user: { account_type?: AccountType } | null | undefined,
): boolean {
  return user?.account_type != null
}
