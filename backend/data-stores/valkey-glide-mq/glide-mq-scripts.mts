import { Script } from '@glidemq/speedkey'
import { loadScript } from 'valkyries'

const scripts: Script[] = []
let releaseHookRegistered = false

/** Creates scripts in the same native registry used by workerQueueCommandClient. */
export function registerWorkerQueueScript(code: string): Script {
  if (!releaseHookRegistered) {
    releaseHookRegistered = true
    process.once('exit', releaseWorkerQueueScripts)
  }
  const script = new Script(code)
  scripts.push(script)
  return script
}

export function registerWorkerQueueScriptFile(filename: string, importMetaUrl: string): Script {
  return registerWorkerQueueScript(loadScript(filename, importMetaUrl))
}

function releaseWorkerQueueScripts(): void {
  for (const script of scripts) script.release()
}
