export function commandErrorMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return String(err)
  }

  const error = err as {
    code?: string
    message?: string
    stderr?: Buffer | string
  }
  const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr
  return (stderr || error.message || error.code || 'command failed').trim()
}
