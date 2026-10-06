import { writeRequestContracts } from './write-request-contracts.mts'

await writeRequestContracts({ check: process.argv.includes('--check') })
