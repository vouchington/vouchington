import { chmod, writeFile } from 'node:fs/promises'
import { loadBenchmarkConfig } from './benchmark-config.mts'
import { runBenchmark } from './benchmark-runner.mts'
import { createStructuredDecisionClient } from './structured-decisions.mts'

const config = loadBenchmarkConfig()
const client = createStructuredDecisionClient({ transport: 'openrouter', apiKey: config.apiKey })
const report = await runBenchmark(config, client)
await writeFile(config.outputPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 })
await chmod(config.outputPath, 0o600)
