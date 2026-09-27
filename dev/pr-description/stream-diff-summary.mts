import { processDiffCommand, type DiffCommand } from 'vouchington-tooling/gh-cli'
import { createDiffSummary, reduceDiffBlock, type DiffSummary } from './diff-summary.mts'

export async function collectDiffSummary(command: DiffCommand): Promise<DiffSummary> {
  const summary = createDiffSummary()
  await processDiffCommand(command, block => reduceDiffBlock(summary, block))
  return summary
}
