import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { read } from '@data-stores/psql'

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data-stores/psql/migrations',
)

export interface MigrationStatus {
  applied: string[]
  pending: string[]
  total: number
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  let rows: Array<{ id: string }> = []
  try {
    const result = await read('/* getMigrationStatus */ SELECT id FROM migrations ORDER BY id', [])
    rows = result.rows
  } catch (err) {
    // Only ignore "relation does not exist" (42P01) on a fresh database before first migration run
    if ((err as { code?: string }).code !== '42P01') throw err
  }
  const appliedSet = new Set(rows.map((row: { id: string }) => row.id))

  const filesOnDisk = (await fs.readdir(migrationsFolder))
    .filter(file => {
      if (file.startsWith('.')) return false
      const ext = path.extname(file)
      return ['.sql', '.mts'].includes(ext)
    })
    .sort((a, b) => a.localeCompare(b))

  const applied: string[] = []
  const pending: string[] = []

  for (const file of filesOnDisk) {
    if (appliedSet.has(file)) {
      applied.push(file)
    } else {
      pending.push(file)
    }
  }

  return {
    applied,
    pending,
    total: filesOnDisk.length,
  }
}
