import { beforeEach, describe, expect, it } from 'vitest'
import { clearStore, loadStore } from './storage'

const data = new Map<string, string>()
const memoryStorage: Storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), clear: () => data.clear(), key: index => [...data.keys()][index] ?? null, get length() { return data.size } }

beforeEach(() => { data.clear(); globalThis.localStorage = memoryStorage })

describe('storage migration and deletion', () => {
  it('reads legacy history and writes it to the current key', () => {
    data.set('optistudy-store-v1', JSON.stringify({ version: 1, attempts: [{ id: 'old' }], profile: { priority: 'Reading', daysOff: [] } }))
    const store = loadStore()
    expect(store.attempts[0].id).toBe('old')
    expect(data.has('ielts-optimizer-store-v1')).toBe(true)
  })
  it('clears both current and legacy keys', () => {
    data.set('ielts-optimizer-store-v1', '{}'); data.set('optistudy-store-v1', '{}')
    clearStore()
    expect(data.size).toBe(0)
  })
  it('pauses a recovered timer instead of counting closed-tab time', () => {
    data.set('ielts-optimizer-store-v1', JSON.stringify({ version: 1, activeSession: { id: 's', startedAt: '2026-01-01T10:00:00Z', lastResumedAt: '2026-01-01T10:00:00Z', accumulatedSeconds: 30, paused: false } }))
    expect(loadStore().activeSession?.paused).toBe(true)
  })
})
