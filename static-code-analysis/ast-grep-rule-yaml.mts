import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { isMap, parseDocument } from 'yaml'

// ast-grep 0.51 rejects unknown top-level keys. `examples` is the example
// runner's fixture field; that runner parses the source file itself.
export function ruleYamlWithoutExamples(source: string): string {
  const document = parseDocument(source)
  if (document.errors.length > 0 || !isMap(document.contents) || !document.contents.has('examples'))
    return source
  document.contents.delete('examples')
  return document.toString()
}

export function writeRuleTreeWithoutExamples(sourceDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const from = join(sourceDir, entry.name)
    const to = join(destDir, entry.name)
    if (entry.isDirectory()) {
      writeRuleTreeWithoutExamples(from, to)
      continue
    }
    if (!entry.isFile()) continue
    if (/\.ya?ml$/u.test(entry.name)) {
      writeFileSync(to, ruleYamlWithoutExamples(readFileSync(from, 'utf8')))
      continue
    }
    copyFileSync(from, to)
  }
}

export function executeAstGrepWithoutExamples(args: readonly string[], cwd: string) {
  const next = [...args]
  const ruleFlag = next.indexOf('--rule')
  const rulePath = next[ruleFlag + 1]
  if (ruleFlag !== -1 && rulePath && !rulePath.startsWith('-')) {
    const source = isAbsolute(rulePath) ? rulePath : resolve(cwd, rulePath)
    const dest = join(cwd, 'rule.without-examples.yml')
    writeFileSync(dest, ruleYamlWithoutExamples(readFileSync(source, 'utf8')))
    next[ruleFlag + 1] = dest
  }
  const result = spawnSync('ast-grep', next, { cwd, encoding: 'utf8' })
  if (result.error) throw new Error(`ast-grep failed to spawn: ${result.error.message}`)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
