import { join } from 'node:path'
import { analyzePairedResults } from './analyze-command.mts'
import { loadLatestPairedResults } from './paired-results.mts'

if (import.meta.main) {
  const { filePath, results, repeatedResults } = loadLatestPairedResults(
    join(import.meta.dirname, 'output'),
  )
  analyzePairedResults(filePath, results, repeatedResults)
  process.exit(0)
}
