import { Script } from '@glidemq/speedkey'
import { createScriptRegistry } from '@vouchington/utils/script-registry'
import { loadScript } from 'valkyries'

/** Creates scripts in the same native registry used by workerQueueCommandClient. */
const registry = createScriptRegistry(code => new Script(code))

export const registerWorkerQueueScript = registry.register

export function registerWorkerQueueScriptFile(filename: string, importMetaUrl: string): Script {
  return registry.register(loadScript(filename, importMetaUrl))
}
