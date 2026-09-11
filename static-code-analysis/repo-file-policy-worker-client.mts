import { Worker } from 'node:worker_threads'

import type { CheckResult } from './node-check-types.mts'

export type RunRepoFilePolicyInWorker = (
  repoRoot: string,
  isInsideGitRepo: boolean,
  trackedFiles: readonly string[],
) => Promise<CheckResult>

export function parseRepoFilePolicyWorkerMessage(message: unknown): CheckResult {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    throw new Error('repo-file-policy worker returned an invalid message')
  }
  if (message.type === 'error' && 'message' in message && typeof message.message === 'string') {
    throw new Error(`repo-file-policy worker failed: ${message.message}`)
  }
  if (
    message.type === 'result' &&
    'errors' in message &&
    Array.isArray(message.errors) &&
    message.errors.every(error => typeof error === 'string')
  ) {
    return { errors: message.errors, name: 'repo-file-policy' }
  }
  throw new Error('repo-file-policy worker returned an invalid message')
}

export function runRepoFilePolicyInWorker(
  repoRoot: string,
  isInsideGitRepo: boolean,
  trackedFiles: readonly string[],
): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('repo-file-policy-worker.mts', import.meta.url), {
      workerData: { repoRoot, isInsideGitRepo, trackedFiles },
      // Without an explicit cap, the worker's old-space limit is whatever V8 derives from the
      // host's physical RAM, so the same retained-AST regression that OOMs a small CI runner can
      // pass silently on a large dev box. This number is bracketed against the real worker
      // running checkRepoFilePolicy end to end (all ~38 guards, not just the streaming AST pass
      // in isolation): post-streaming-fix, the real minimum passing cap is ~1060-1088 MB;
      // pre-fix (parsedTypeScript caching every AST), it's >2048 MB (fails at 2048, passes at
      // 3072). 1536 MB sits with real margin above the fixed floor and real margin below the
      // regressed floor, so it both tolerates normal run-to-run variance (GC timing, transient
      // spikes like tsconfigFileCoverage) and still fails deterministically if AST retention
      // regresses. See the repo-file-policy worker OOM investigation, CI job 31151347379.
      resourceLimits: { maxOldGenerationSizeMb: 1536 },
    })
    let settled = false

    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    const resolveOnce = (result: CheckResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    worker.once('error', error =>
      rejectOnce(error instanceof Error ? error : new Error(String(error))),
    )
    worker.once('exit', code => {
      if (code !== 0) rejectOnce(new Error(`repo-file-policy worker exited with code ${code}`))
    })
    worker.once('message', (message: unknown) => {
      try {
        resolveOnce(parseRepoFilePolicyWorkerMessage(message))
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}
