import { runRateLimitNamespaceCollisionCli } from '@vouchington/rate-limit/edge'

await runRateLimitNamespaceCollisionCli({
  args: process.argv.slice(2),
  targetScript: 'voucha-cloudflare-worker-staging',
  env: process.env,
  isMain: import.meta.main,
  log: console.log,
})
