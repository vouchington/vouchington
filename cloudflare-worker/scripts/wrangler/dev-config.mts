export function getWranglerDevWorkerPort(
  userArgs: readonly string[],
  envPort: string | undefined,
  defaultPort = '8787',
): string {
  let port = envPort?.trim() || defaultPort

  for (let index = 0; index < userArgs.length; index++) {
    const arg = userArgs[index]
    if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length).trim()
      if (value) port = value
      continue
    }

    if (arg === '--port') {
      const value = userArgs[index + 1]?.trim()
      if (value) port = value
      index++
    }
  }

  return port
}
