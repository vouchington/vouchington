import { inflateRawSync } from 'node:zlib'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50

/** Read every file entry of an in-memory zip archive as UTF-8 text, keyed by entry name. */
export function readZipEntries(archive: Buffer): Record<string, string> {
  let end = archive.length - 22
  while (end >= 0 && archive.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) end--
  if (end < 0) throw new Error('Not a zip archive')
  const entryCount = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  const files: Record<string, string> = {}
  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) throw new Error('Corrupt zip')
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength)
    const dataStart =
      localOffset +
      30 +
      archive.readUInt16LE(localOffset + 26) +
      archive.readUInt16LE(localOffset + 28)
    const data = archive.subarray(dataStart, dataStart + compressedSize)
    if (!name.endsWith('/')) {
      files[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}
