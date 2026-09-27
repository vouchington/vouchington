import { runBoundedCommand } from './bounded-exec.mts'
import {
  buildImageAttestationVerifyArgs,
  parseTrustedImageProvenance,
  type ImageProvenanceRequest,
  type TrustedImageProvenance,
} from './image-provenance.mts'

const TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

export type ImageProvenanceVerifierOptions = {
  ghExecutable?: string
  timeoutMs?: number
  maxOutputBytes?: number
  signal?: AbortSignal
}

export async function verifyImageProvenance(
  request: ImageProvenanceRequest,
  options: ImageProvenanceVerifierOptions = {},
): Promise<TrustedImageProvenance[]> {
  const immutableRequest = { ...request }
  const args = buildImageAttestationVerifyArgs(immutableRequest)
  const timeout = options.timeoutMs ?? TIMEOUT_MS
  const maxBuffer = options.maxOutputBytes ?? MAX_OUTPUT_BYTES
  if (
    !Number.isSafeInteger(timeout) ||
    timeout <= 0 ||
    timeout > TIMEOUT_MS ||
    !Number.isSafeInteger(maxBuffer) ||
    maxBuffer <= 0 ||
    maxBuffer > MAX_OUTPUT_BYTES
  )
    throw new Error('invalid image provenance verifier bounds')
  let stdout: string
  try {
    stdout = await runBoundedCommand({
      args,
      executable: options.ghExecutable ?? 'gh',
      maxOutputBytes: maxBuffer,
      signal: options.signal,
      timeoutMs: timeout,
    })
  } catch {
    throw new Error('image provenance verification process failed')
  }
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new Error('image provenance verifier returned malformed JSON')
  }
  return parseTrustedImageProvenance(value, immutableRequest)
}
