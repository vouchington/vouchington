import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { checkTrivyPolicy } from './trivy-policy.mts'

describe('finite Trivy policy', () => {
  it('runs the complete policy against explicit finite tracked inputs and rejects unsafe changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trivy-static-policy-'))
    const workflow = '.github/workflows/check.yml'
    const files = [workflow, '.trivyignore.yaml']
    const gate =
      'trivy filesystem --scanners vuln --quiet --skip-db-update --pkg-types os --exit-code "$TRIVY_FINDINGS_EXIT_CODE" --severity CRITICAL,HIGH --ignore-unfixed --ignorefile .trivyignore.yaml --format table --table-mode detailed --output report.txt target'
    const sbom =
      'trivy filesystem --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom.json target'
    const writeWorkflow = (commands: string[]) =>
      writeFile(
        join(root, workflow),
        stringify({ jobs: { scan: { steps: commands.map(run => ({ run })) } } }),
      )
    try {
      await mkdir(join(root, '.github/workflows'), { recursive: true })
      await writeWorkflow([gate, gate, sbom, sbom])
      await writeFile(join(root, '.trivyignore.yaml'), 'vulnerabilities: []\n')
      await writeFile(join(root, '.github/workflows/untracked.yml'), 'not: [valid')
      expect(() => checkTrivyPolicy(root, files)).not.toThrow('ENOENT')
      await writeWorkflow([gate, sbom])
      expect(() => checkTrivyPolicy(root, files)).toThrow('OS gates')
      await writeWorkflow([gate.replace('--pkg-types os', '--pkg-types library'), gate, sbom, sbom])
      expect(() => checkTrivyPolicy(root, files)).toThrow('--pkg-types os')
      await writeWorkflow([gate, gate, sbom, sbom])
      await writeFile(join(root, '.trivyignore.yaml'), 'vulnerabilities: wrong\n')
      expect(() => checkTrivyPolicy(root, files)).toThrow('vulnerabilities must be an array')
      expect(() => checkTrivyPolicy(root, [workflow])).toThrow('must be tracked')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
