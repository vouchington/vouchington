function cborTextString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > 23) throw new Error('cborTextString: fixture strings must be <= 23 bytes')
  return Buffer.concat([Buffer.from([0x60 + bytes.length]), bytes])
}

function cborByteString(value: Buffer): Buffer {
  if (value.length <= 23) return Buffer.concat([Buffer.from([0x40 + value.length]), value])
  if (value.length <= 255) return Buffer.concat([Buffer.from([0x58, value.length]), value])
  throw new Error('cborByteString: fixture byte strings must be <= 255 bytes')
}

export function encodeAssertionCbor(signature: Buffer, authenticatorData: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa2]),
    cborTextString('signature'),
    cborByteString(signature),
    cborTextString('authenticatorData'),
    cborByteString(authenticatorData),
  ])
}
