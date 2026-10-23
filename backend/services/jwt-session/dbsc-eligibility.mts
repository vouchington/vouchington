// This transient offer marker is never serialized into a credential response.
const eligibleCredentials = new WeakSet<object>()

export function markDbscRegistrationEligible(credential: object): void {
  eligibleCredentials.add(credential)
}

export function isDbscRegistrationEligible(credential: object): boolean {
  return eligibleCredentials.has(credential)
}
