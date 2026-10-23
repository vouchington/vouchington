import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  trivyPackageScanCommands,
  isComponentSbomGeneration,
  assertVulnerabilityGate,
  assertUnfilteredComponentSbom,
  parseIgnoreRegistry,
  validateIgnoreRegistry,
} from './trivy-policy-helpers.mts'

/** The live policy belongs to static CI; unit controls supply finite source inputs. */
export function checkTrivyPolicy(root: string, trackedFiles: readonly string[]): void {
  const commands = trivyPackageScanCommands(trackedFiles, root)
  const sboms = commands.filter(isComponentSbomGeneration)
  const gates = commands.filter(command => !isComponentSbomGeneration(command))
  if (gates.length < 2 || sboms.length < 2)
    throw new Error('Trivy policy requires OS gates and unfiltered component SBOMs')
  for (const command of gates) assertVulnerabilityGate(command)
  for (const command of sboms) assertUnfilteredComponentSbom(command)
  if (!trackedFiles.includes('.trivyignore.yaml'))
    throw new Error('Trivy exception registry must be tracked')
  validateIgnoreRegistry(parseIgnoreRegistry(readFileSync(join(root, '.trivyignore.yaml'), 'utf8')))
}
