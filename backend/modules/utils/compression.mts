import { gunzip, gzip } from 'node:zlib'

export function gzipBytes(value: Uint8Array): Promise<Uint8Array> {
  return transformBytes(value, gzip)
}

export function gunzipBytes(value: Uint8Array): Promise<Uint8Array> {
  return transformBytes(value, gunzip)
}

type ByteTransform = (
  value: Uint8Array,
  callback: (error: Error | null, result: Buffer<ArrayBufferLike>) => void,
) => void

function transformBytes(value: Uint8Array, transform: ByteTransform): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    transform(value, (error, result) => {
      if (error) {
        reject(error)
        return
      }

      resolve(new Uint8Array(result.buffer, result.byteOffset, result.byteLength))
    })
  })
}
