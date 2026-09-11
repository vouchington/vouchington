import { writeOpenApi } from './write-openapi.mts'

await writeOpenApi({ check: process.argv.includes('--check') })
