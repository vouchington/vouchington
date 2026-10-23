import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publishedScriptsDir = fileURLToPath(
  new URL('../../node_modules/vouchington-tooling/scripts/worktree', import.meta.url),
)

/** Stages the published worktree shell helpers where the dev scripts source them. */
export async function stageToolingWorktreeScripts(root: string): Promise<void> {
  await cp(publishedScriptsDir, join(root, 'node_modules/vouchington-tooling/scripts/worktree'), {
    recursive: true,
  })
}
