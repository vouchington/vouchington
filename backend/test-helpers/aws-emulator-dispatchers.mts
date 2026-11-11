import { Agent, EnvHttpProxyAgent } from 'undici'

/**
 * Dispatchers for the test harness's own HTTP calls. The application's external dispatcher refuses
 * loopback addresses, and the emulator listens on loopback, so presigned-URL requests use a plain
 * agent. The package download honors HTTPS_PROXY where a sandbox requires one; CI connects directly.
 */
export function createAwsEmulatorLoopbackDispatcher(): Agent {
  return new Agent()
}

export function createAwsEmulatorDownloadDispatcher(): EnvHttpProxyAgent {
  return new EnvHttpProxyAgent()
}
