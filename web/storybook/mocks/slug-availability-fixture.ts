let slugAvailabilityFixture = false

export function setSlugAvailabilityFixture(): void {
  slugAvailabilityFixture = true
}

export function clearSlugAvailabilityFixture(): void {
  slugAvailabilityFixture = false
}

export function availabilityFixtureBody(
  endpoint: string,
): { available: true; conflict: null } | undefined {
  if (!slugAvailabilityFixture || endpoint !== '/api/v1/availability') return undefined
  return { available: true, conflict: null }
}
