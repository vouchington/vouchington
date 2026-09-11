const encoder = new TextEncoder()

/**
 * Compares every same-length credential with a byte-level XOR loop. Iterating the full set avoids
 * exposing which credential matched. Length remains observable from the request header itself.
 */
export function timingSafeCredentialMatch(input: string, creds: Set<string>): boolean {
  const inputBytes = encoder.encode(input)
  let matched = false
  for (const cred of creds) {
    const credBytes = encoder.encode(cred)
    if (inputBytes.length !== credBytes.length) continue
    let diff = 0
    for (let i = 0; i < inputBytes.length; i++) {
      diff |= (inputBytes[i] as number) ^ (credBytes[i] as number)
    }
    if (diff === 0) matched = true
  }
  return matched
}
