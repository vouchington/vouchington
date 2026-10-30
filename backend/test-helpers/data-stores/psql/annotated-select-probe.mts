import { write } from '@data-stores/psql'

export function writeAnnotatedSelectProbe(): ReturnType<typeof write> {
  return write('/* postSearch */ SELECT 1')
}
