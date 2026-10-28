// Entry of the compiled API executable. It serves HTTP by default and runs the operational
// entrypoints that ECS task overrides and image smoke tests name. Their container command is
// `[...node flags, '<entrypoint>.mts', ...arguments]`, so everything up to the entrypoint is
// dropped and the entrypoint reads its own arguments from `process.argv.slice(2)` as under Node.
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'migrate.mts': () => import('./migrate.mts'),
  'serve.mts': () => import('./serve.mts'),
  'valkey-admin.mts': () => import('./valkey-admin.mts'),
  'verify-ipv6-egress.mts': () => import('./verify-ipv6-egress.mts'),
}

const index = process.argv.findIndex((arg, i) => i >= 2 && Object.hasOwn(ENTRYPOINTS, arg))
const entrypoint = index === -1 ? 'serve.mts' : process.argv.splice(2, index - 1).at(-1)!

/* c8 ignore next -- process entrypoint exercised by the compiled image smoke tests. */
await ENTRYPOINTS[entrypoint]!()
