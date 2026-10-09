import { validateVitestCommand } from './vitest-cli-timeout-policy.mts'

try {
  validateVitestCommand(process.argv.slice(2))
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
}
