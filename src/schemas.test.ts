import { describe, expect, it } from 'vitest'
import { lintSchema } from 'deepspace/worker'
import { schemas } from './schemas'

describe('schemas', () => {
  it.each(schemas.map((s) => [s.name, s] as const))('%s passes schema-lint', (_name, schema) => {
    expect(lintSchema(schema)).toEqual([])
  })
})
