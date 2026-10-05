/** Blank operator credentials keep durable rows pending without a claim or ledger entry. */
export function isDsaTransparencyDatabaseConfigured(credentials: {
  url: string
  token: string
}): boolean {
  return credentials.url.trim().length > 0 && credentials.token.trim().length > 0
}
