import { runCompileCli } from './compile-catalog.mts'

const revision = await runCompileCli(process.argv.slice(2))
console.log(revision)
process.exit(0)
