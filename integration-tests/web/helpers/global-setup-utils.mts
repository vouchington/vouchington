import { rmSync, writeFileSync } from 'node:fs'
import { type ReservedPort } from './ports.mts'
import { type ManagedProcess, startManagedProcess } from './processes.mts'

export async function startReservedProcess(
  reservation: ReservedPort,
  processes: ManagedProcess[],
  options: Parameters<typeof startManagedProcess>[0],
): Promise<ManagedProcess> {
  await reservation.release()
  const managedProcess = startManagedProcess(options)
  processes.push(managedProcess)
  return managedProcess
}

export async function cleanupGlobalSetupState(options: {
  existingWorkerDevVars: string | null
  processes: ManagedProcess[]
  reservedPorts: ReservedPort[]
  traceProxy: { close: () => Promise<void> }
  workerDevVarsPath: string
}): Promise<void> {
  const { existingWorkerDevVars, processes, reservedPorts, traceProxy, workerDevVarsPath } = options

  await Promise.allSettled(processes.reverse().map(process => process.stop()))
  await Promise.allSettled(reservedPorts.map(reservation => reservation.release()))
  await Promise.allSettled([traceProxy.close()])
  restoreWorkerDevVars(existingWorkerDevVars, workerDevVarsPath)
}

function restoreWorkerDevVars(
  existingWorkerDevVars: string | null,
  workerDevVarsPath: string,
): void {
  if (existingWorkerDevVars === null) {
    rmSync(workerDevVarsPath, { force: true })
    return
  }

  writeFileSync(workerDevVarsPath, existingWorkerDevVars)
}
