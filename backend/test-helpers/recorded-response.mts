import { loadRecordedResponse as loadFixture } from 'vouchington-tooling/provider-replay'

const FIXTURE_ROOT = new URL('./provider-fixtures/', import.meta.url)

/** Loads `provider-fixtures/<name>`; `replace` swaps literal tokens, for ids a test must keep unique. */
export function loadRecordedResponse(
  name: string,
  options: { replace?: Record<string, string> } = {},
) {
  return loadFixture(name, { fixtureRoot: FIXTURE_ROOT, ...options })
}
