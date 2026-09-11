import { writeApiFixtures } from './write.mts'

await writeApiFixtures({ check: process.argv.includes('--check') })
