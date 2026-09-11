import { parentPort, workerData } from 'node:worker_threads'

import { checkRepoFilePolicy } from './repo-file-policy/index.mts'
import {
  buildContextFromTrackedFiles,
  type SharedContext,
} from 'vouchington-tooling/shared-context'

interface RepoFilePolicyWorkerData {
  repoRoot: string
  isInsideGitRepo: boolean
  trackedFiles: readonly string[]
}

export interface RepoFilePolicyWorkerSuccess {
  errors: string[]
  type: 'result'
}

export interface RepoFilePolicyWorkerFailure {
  message: string
  type: 'error'
}

export type RepoFilePolicyWorkerMessage = RepoFilePolicyWorkerSuccess | RepoFilePolicyWorkerFailure

function isWorkerData(value: unknown): value is RepoFilePolicyWorkerData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'repoRoot' in value &&
    typeof value.repoRoot === 'string' &&
    'isInsideGitRepo' in value &&
    typeof value.isInsideGitRepo === 'boolean' &&
    'trackedFiles' in value &&
    Array.isArray(value.trackedFiles)
  )
}

async function run(): Promise<void> {
  if (parentPort === null) throw new Error('repo-file-policy worker requires a parent port')
  if (!isWorkerData(workerData)) throw new Error('repo-file-policy worker received invalid data')
  const port = parentPort
  const send = (message: RepoFilePolicyWorkerMessage): void => {
    Reflect.apply(port.postMessage, port, [message])
  }

  try {
    // The parent thread already resolved the tracked-file list (buildSharedContext) before
    // spawning this worker — worker_threads doesn't share module-level JS state across threads,
    // so reuse that list instead of spawning a second `git ls-files` here.
    const ctx: SharedContext = workerData.isInsideGitRepo
      ? buildContextFromTrackedFiles(workerData.repoRoot, workerData.trackedFiles)
      : {
          repoRoot: workerData.repoRoot,
          isInsideGitRepo: false,
          trackedFiles: [],
          trackedFileSet: new Set(),
        }
    const report = await checkRepoFilePolicy(ctx)
    send({
      errors: report.errors,
      type: 'result',
    } satisfies RepoFilePolicyWorkerSuccess)
  } catch (error) {
    send({
      message: error instanceof Error ? error.message : String(error),
      type: 'error',
    } satisfies RepoFilePolicyWorkerFailure)
  }
}

void run()
