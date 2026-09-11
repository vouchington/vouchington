import { open, type FileHandle } from 'node:fs/promises'

export const writePrivateJson = async (path: string, value: unknown): Promise<void> => {
  await using file = await open(path, 'w', 0o600)
  await writePrivateFile(file, value)
}

async function writePrivateFile(file: FileHandle, value: unknown): Promise<void> {
  await file.chmod(0o600)
  await file.writeFile(`${JSON.stringify(value, null, 2)}\n`)
}
