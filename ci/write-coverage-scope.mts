import { writeFileSync } from 'node:fs'
import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'

const outputFile = process.argv[2]
if (!outputFile) throw new Error('Coverage scope output path is required')
const { include, exclude } = coverageConfigForScope(undefined)
writeFileSync(outputFile, JSON.stringify({ include, exclude }))
