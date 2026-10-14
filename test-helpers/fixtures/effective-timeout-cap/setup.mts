import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./setup-import.marker', import.meta.url), 'imported')

export default function setup() {
  writeFileSync(new URL('./setup-call.marker', import.meta.url), 'called')
}
