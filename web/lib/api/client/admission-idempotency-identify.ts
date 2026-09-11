import { ADMISSION_STORAGE_PREFIX } from './admission-idempotency-storage'

export type AdmissionFingerprintState = { available: boolean }

export async function identifyAdmissionIntent(
  canonicalIntent: string,
  actorId: string | null | undefined,
  fingerprint: (value: string) => Promise<string>,
  fingerprintState: AdmissionFingerprintState,
): Promise<{ storageKey: string; intentFingerprint: string }> {
  if (!fingerprintState.available) return memoryIdentity(canonicalIntent, actorId)
  try {
    const intentFingerprint = await fingerprint(canonicalIntent)
    if (!actorId) return { storageKey: `memory:${intentFingerprint}`, intentFingerprint }
    const actorIntentFingerprint = await fingerprint(JSON.stringify({ actorId, intentFingerprint }))
    return {
      storageKey: `${ADMISSION_STORAGE_PREFIX}${actorIntentFingerprint}`,
      intentFingerprint,
    }
  } catch {
    fingerprintState.available = false
    return memoryIdentity(canonicalIntent, actorId)
  }
}

function memoryIdentity(
  canonicalIntent: string,
  actorId: string | null | undefined,
): { storageKey: string; intentFingerprint: string } {
  if (actorId) throw new Error('Durable admission requires browser fingerprinting support')
  return { storageKey: `memory:${canonicalIntent}`, intentFingerprint: canonicalIntent }
}
