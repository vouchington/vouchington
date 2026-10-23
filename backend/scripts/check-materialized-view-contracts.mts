import '../test-helpers/request-query-profile-native-preload.mts'

if (process.env.VITEST !== undefined) {
  throw new Error('Native materialized-view contracts must run with VITEST unset')
}

await import('./native-mv-contracts/run.mts')
