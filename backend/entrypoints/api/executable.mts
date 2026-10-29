// Entry of the compiled API executable. It serves HTTP by default and runs the operational
// entrypoints that ECS task overrides and image smoke tests name as the container command.
import { selectExecutableEntrypoint } from '@modules/utils/executable-entrypoint'

/* v8 ignore start -- process entrypoint exercised by the compiled image smoke tests. */
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'migrate.mts': () => import('./migrate.mts'),
  'serve.mts': () => import('./serve.mts'),
  'valkey-admin.mts': () => import('./valkey-admin.mts'),
  'verify-ipv6-egress.mts': () => import('./verify-ipv6-egress.mts'),
}

const { entrypoint, argv } = selectExecutableEntrypoint(
  process.argv,
  Object.keys(ENTRYPOINTS),
  'serve.mts',
)
process.argv = argv
await ENTRYPOINTS[entrypoint]!()
/* v8 ignore stop */
