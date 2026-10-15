/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

describe('critical UI bindings', () => {
  it('renders the recommendation reason as a JSX expression', () => {
    expect(app).toContain('<p>{rec.reason}</p>')
    expect(app).not.toContain('<p>rec.reason</p>')
  })
})
