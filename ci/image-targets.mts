import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { RegistryTarget } from './image-registry.mts'

const WORKER_IO_FLAG = 'WORKER_IO_AUTOMATION_ENABLED='

export async function selectedImageTargets(
  group: 'backend' | 'web',
  workspaceRoot = process.cwd(),
): Promise<RegistryTarget[]> {
  if (group === 'web') return ['web']
  let flag: string
  try {
    flag = await readFile(resolve(workspaceRoot, '.github/worker-io-automation.env'), 'utf8')
  } catch {
    throw new Error('worker-io automation flag is invalid')
  }
  if (flag === `${WORKER_IO_FLAG}false\n`) return ['api', 'worker-cpu']
  if (flag === `${WORKER_IO_FLAG}true\n`) return ['api', 'worker-cpu', 'worker-io']
  throw new Error('worker-io automation flag is invalid')
}
