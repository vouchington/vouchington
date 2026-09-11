#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempDisposableSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runAstGrepExamples } from 'vouchington-tooling/ast-grep-examples'
import { astGrepPackPaths } from 'vouchington-tooling/ast-grep-pack'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { withPackRuleDir } from './ast-grep-pack-config.mts'

const pack = astGrepPackPaths()
const config = yamlParse(readFileSync('sgconfig.yml', 'utf8')) as { ruleDirs: string[] }
using dir = mkdtempDisposableSync(join(tmpdir(), 'ast-grep-sgconfig-'))
const configPath = join(dir.path, 'sgconfig.yml')
const resolved = {
  ...config,
  ruleDirs: config.ruleDirs.map(ruleDir => resolve(ruleDir)),
}

writeFileSync(configPath, yamlStringify(withPackRuleDir(resolved, pack.rules)))
const scan = spawnSync('ast-grep', ['scan', '--no-ignore', 'hidden', '--config', configPath], {
  stdio: 'inherit',
})
const statuses = [
  scan.status ?? 1,
  runAstGrepExamples(pack),
  runAstGrepExamples({ rules: 'ast-grep-rules', config: 'sgconfig.yml' }),
]
process.exitCode = statuses.find(status => status !== 0) ?? 0
