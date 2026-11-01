import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCsvRows } from '../backend/modules/csv/parse-csv.mts'

import {
  invalidTopicRowFailures,
  seedTopicCsvCatalogFailures,
  seedTopicCsvShapeFailures,
  unknownTopicColumnFailures,
  type TopicCsvFile,
  type TopicRowValidation,
} from './seed-topic-csv-policy.mts'

// Shipped seed/*-topics.csv catalog for the static backend gate. Not a Vitest root.
// Loading the importer validator starts HTTP dispatchers, so this process must exit
// instead of waiting for those handles to drain.
const seedDir = fileURLToPath(new URL('../seed', import.meta.url))

type TopicValidator = {
  validateTopicHeaders: (headers: string[]) => string[]
  validateTopicRows: (rows: Record<string, string>[]) => { rows: TopicRowValidation[] }
}

const files = readTopicFiles()
const catalog = seedTopicCsvCatalogFailures(files)
const failures = [
  ...seedTopicCsvShapeFailures(files.length, catalog.rowCount, catalog.feedCount),
  ...catalog.failures,
  ...(await importerFailures(files)),
]
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
process.exit(0)

function readTopicFiles(): TopicCsvFile[] {
  return readdirSync(seedDir)
    .filter(file => file.endsWith('-topics.csv'))
    .toSorted()
    .map(file => ({
      file,
      rows: parseCsvRows(readFileSync(join(seedDir, file), 'utf8')),
    }))
}

async function importerFailures(topicFiles: readonly TopicCsvFile[]): Promise<string[]> {
  const validator = await importTopicValidator()
  const failures: string[] = []
  for (const topicFile of topicFiles) {
    const headerRow = topicFile.rows[0]
    if (!headerRow) continue
    failures.push(
      ...unknownTopicColumnFailures(
        topicFile.file,
        validator.validateTopicHeaders(Object.keys(headerRow)),
      ),
      ...invalidTopicRowFailures(
        topicFile.file,
        topicFile.rows,
        validator.validateTopicRows(topicFile.rows).rows,
      ),
    )
  }
  const shippedRows = topicFiles.flatMap(topicFile => topicFile.rows)
  failures.push(
    ...invalidTopicRowFailures(
      'catalog',
      shippedRows,
      validator.validateTopicRows(shippedRows).rows,
    ),
  )
  return failures
}

async function importTopicValidator(): Promise<TopicValidator> {
  const specifier = new URL(
    '../backend/services/admin-imports/validate-topics.mts',
    import.meta.url,
  ).href
  return (await import(specifier)) as TopicValidator
}
