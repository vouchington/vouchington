import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  auditCiJobRuntime as auditPublished,
  type GhApiExecutor,
  type RuntimeAuditOptions,
  type RuntimeAuditResult,
} from 'vouchington-tooling/gha-runtime-audit'

export type { GhApiExecutor } from 'vouchington-tooling/gha-runtime-audit'

export const vouchingtonRuntimeAuditOptions: Omit<RuntimeAuditOptions, 'repository'> = {
  branch: 'main',
  workflows: [
    { name: 'CI', event: 'pull_request' },
    { name: /^Main CI \(.+\)$/, event: 'push' },
  ],
  // Raised from the tool default (360s) alongside the fewer/longer-running-shards CI target
  // (<10m hard ceiling, targeting 8m per job). Leave hardCeilingSeconds at its 600s default —
  // that's the repo's actual hard ceiling and is unrelated to this median-band policy change.
  medianThresholdSeconds: 480,
}

export async function auditCiJobRuntime(
  execute: GhApiExecutor,
  repository: string,
): Promise<RuntimeAuditResult> {
  return auditPublished(execute, { repository, ...vouchingtonRuntimeAuditOptions })
}

async function main(): Promise<void> {
  const repository = process.env['GITHUB_REPOSITORY']
  if (!repository) throw new Error('GITHUB_REPOSITORY is required')
  const execute: GhApiExecutor = async request =>
    JSON.parse(
      execFileSync('gh', ['api', request.endpoint, '--jq', request.jq], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    ) as unknown
  process.stdout.write(`${JSON.stringify(await auditCiJobRuntime(execute, repository), null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
