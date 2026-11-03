// Entry of the compiled API executable. The first argument after any `-` flags must name an
// entrypoint (`serve.mts` is the image's default command); anything else fails instead of serving,
// so a command written for Node, such as `--eval`, cannot silently start a server.
import { selectExecutableEntrypoint } from '@modules/utils/executable-entrypoint'

/* v8 ignore start -- process entrypoint exercised by the compiled image smoke tests. */
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'migrate.mts': () => import('./migrate.mts'),
  'schema-reset.mts': () => import('./schema-reset.mts'),
  'serve.mts': () => import('./serve.mts'),
  'staging-aurora-wake.mts': () => import('./staging-aurora-wake.mts'),
  'valkey-admin.mts': () => import('./valkey-admin.mts'),
  'verify-ipv6-egress.mts': () => import('./verify-ipv6-egress.mts'),
}

const { entrypoint, argv } = selectExecutableEntrypoint(process.argv, Object.keys(ENTRYPOINTS))
process.argv = argv
await ENTRYPOINTS[entrypoint]!()
/* v8 ignore stop */
