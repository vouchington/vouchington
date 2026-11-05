#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempDisposableSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAstGrepExamples } from 'vouchington-tooling/ast-grep-examples'
import { astGrepPackPaths } from 'vouchington-tooling/ast-grep-pack'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import {
  executeAstGrepWithoutExamples,
  writeRuleTreeWithoutExamples,
} from './ast-grep-rule-yaml.mts'
import { withPackRuleDir } from './ast-grep-pack-config.mts'
import {
  backendManifestRuleId,
  scanTrackedBackendPackageManifests,
} from './ast-grep-backend-manifests.mts'

const pack = astGrepPackPaths()
const routeAdminExamples = fileURLToPath(
  new URL('./repo-file-policy/ast-grep-queries/', import.meta.url),
)
const sourceConfig = fileURLToPath(new URL('../sgconfig.yml', import.meta.url))
const config = yamlParse(readFileSync('sgconfig.yml', 'utf8')) as { ruleDirs: string[] }
using dir = mkdtempDisposableSync(join(tmpdir(), 'ast-grep-sgconfig-'))
const configPath = join(dir.path, 'sgconfig.yml')
const packed = withPackRuleDir(
  {
    ...config,
    ruleDirs: config.ruleDirs.map(ruleDir => resolve(ruleDir)),
  },
  pack.rules,
)
const ruleDirs = packed.ruleDirs.map((ruleDir, index) => {
  const dest = join(dir.path, `rules-${index}`)
  writeRuleTreeWithoutExamples(ruleDir, dest)
  return dest
})

writeFileSync(configPath, yamlStringify({ ...packed, ruleDirs }))
const scan = spawnSync(
  'ast-grep',
  ['scan', '--no-ignore', 'hidden', '--config', configPath, `--off=${backendManifestRuleId}`],
  {
    stdio: 'inherit',
  },
)
const statuses = [
  scan.status ?? 1,
  scanTrackedBackendPackageManifests(),
  runAstGrepExamples({ ...pack, execute: executeAstGrepWithoutExamples }),
  runAstGrepExamples({
    rules: 'ast-grep-rules',
    config: 'sgconfig.yml',
    execute: executeAstGrepWithoutExamples,
  }),
  runAstGrepExamples({
    rules: routeAdminExamples,
    config: sourceConfig,
    execute: executeAstGrepWithoutExamples,
  }),
]
process.exitCode = statuses.find(status => status !== 0) ?? 0
