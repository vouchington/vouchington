import { pathToFileURL } from 'node:url'

import {
  applyRetentionPlan,
  buildRetentionPlan,
  RetentionDeletionError,
  type RetentionOptions,
} from './image-retention.mts'

const DEADLINE_MS = 8 * 60 * 1000

export async function runImageRetention(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  options: RetentionOptions = {},
): Promise<number> {
  const args = [...argv]
  const immutableOptions: RetentionOptions = {
    ...options,
    git: { ...options.git },
    github: { ...options.github },
    provenance: { ...options.provenance },
    registry: { ...options.registry },
  }
  if (args.length !== 1 || !['--apply', '--dry-run'].includes(args[0]!)) {
    console.error('usage: ghcr-package-retention.sh --apply|--dry-run')
    return 2
  }
  const githubToken = env['GH_TOKEN']
  const username = env['GHCR_USERNAME']
  const password = env['GHCR_PASSWORD']
  if (!githubToken || !username || !password) {
    console.error('image retention credentials are missing')
    return 2
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const signal = immutableOptions.signal
    ? AbortSignal.any([
        immutableOptions.signal,
        controller.signal,
        AbortSignal.timeout(DEADLINE_MS),
      ])
    : AbortSignal.any([controller.signal, AbortSignal.timeout(DEADLINE_MS)])
  try {
    const request = { credentials: { password, username }, githubToken }
    const plan = await buildRetentionPlan(request, { ...immutableOptions, signal })
    console.log(JSON.stringify({ mode: args[0], plan }))
    if (args[0] === '--dry-run') return 0
    const result = await applyRetentionPlan(request, plan, { ...immutableOptions, signal })
    console.log(
      JSON.stringify({ deleted: result.deleted.map(({ id, target }) => ({ id, target })) }),
    )
    return 0
  } catch (error) {
    if (error instanceof RetentionDeletionError) {
      console.error(
        JSON.stringify({
          deleted: error.deleted.map(({ id, target }) => ({ id, target })),
          error: error.message,
          indeterminate: error.indeterminate
            ? { id: error.indeterminate.id, target: error.indeterminate.target }
            : null,
          neverAttempted: error.neverAttempted.map(({ id, target }) => ({ id, target })),
        }),
      )
    } else console.error('image retention failed')
    return 1
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runImageRetention()
