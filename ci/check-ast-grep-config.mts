import { fileURLToPath } from 'node:url'
import {
  checkAstGrepConfigParity,
  discoverAstGrepConfig,
} from 'vouchington-tooling/ast-grep-config-parity'
import { astGrepPackPaths } from 'vouchington-tooling/ast-grep-pack'

const input = await discoverAstGrepConfig(fileURLToPath(new URL('../', import.meta.url)), {
  localRuleDir: 'ast-grep-rules',
  packRulesDir: astGrepPackPaths().rules,
})
const offenders = checkAstGrepConfigParity({
  ...input,
  languageExceptions: { 'backend-knip-test-export-exclusions.yml': 'Json' },
})

for (const { name, reason, detail } of offenders) {
  console.error(`${name}: ${reason}: ${detail}`)
}
if (offenders.length > 0) process.exitCode = 1
else console.log('ast-grep config parity: ok')
