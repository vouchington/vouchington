import { describe, expect, it } from 'vitest'
import {
  getWebLifecycleScenarios,
  loadLifecycleScenarioManifest,
  type LifecycleScenarioManifest,
} from './manifest'
import { runWebLifecycleContract, runWebLifecycleScenario } from './runner'

describe('web lifecycle scenario contract', () => {
  it('loads and executes every claimed web scenario', async () => {
    const manifest = loadLifecycleScenarioManifest()
    const scenarios = getWebLifecycleScenarios(manifest)
    expect(scenarios.length).toBeGreaterThan(0)
    await expect(runWebLifecycleContract(manifest)).resolves.toBeUndefined()
  })

  it('fails when the web claim names an unknown adapter', async () => {
    const manifest = loadLifecycleScenarioManifest()
    const scenario = getWebLifecycleScenarios(manifest)[0]!
    const broken = {
      ...manifest,
      claims: manifest.claims.map(claim =>
        claim.scenarioId === scenario.id && claim.consumer === 'web'
          ? { ...claim, adapter: 'missing-web-adapter' }
          : claim,
      ),
    } satisfies LifecycleScenarioManifest
    await expect(runWebLifecycleScenario(scenario.id, broken)).rejects.toThrow(
      'Unknown web lifecycle adapter',
    )
  })

  it('rejects duplicate scenario IDs before execution', async () => {
    const manifest = loadLifecycleScenarioManifest()
    const duplicate = {
      ...manifest,
      scenarios: [...manifest.scenarios, manifest.scenarios[0]!],
    }
    await expect(runWebLifecycleContract(duplicate)).rejects.toThrow('Duplicate')
  })

  it('rejects a moderation appeal scenario with a missing or unknown viewer role', async () => {
    const manifest = loadLifecycleScenarioManifest()
    const scenario = manifest.scenarios.find(
      candidate => candidate.family === 'moderation-appeal-lifecycle',
    )!
    const broken = {
      ...manifest,
      scenarios: manifest.scenarios.map(candidate =>
        candidate.id === scenario.id
          ? {
              ...candidate,
              input: {
                ...candidate.input,
                preconditions: { ...candidate.input.preconditions, viewerRole: 'unknown' },
              },
            }
          : candidate,
      ),
    } satisfies LifecycleScenarioManifest

    await expect(runWebLifecycleContract(broken)).rejects.toThrow(
      'Invalid moderation appeal viewerRole',
    )
  })
})
