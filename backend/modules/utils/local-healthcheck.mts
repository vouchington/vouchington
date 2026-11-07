// ECS gives its probe five seconds. Finish the local HTTP request before that deadline,
// without booting the application or contacting its database, queues, or external services.
export async function checkLocalHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/infra/ping`, {
      signal: AbortSignal.timeout(4_000),
    })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}
