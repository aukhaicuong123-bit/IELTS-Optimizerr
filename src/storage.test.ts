import { beforeEach, describe, expect, it } from 'vitest'
import { clearStore, deduplicateErrors, loadStore, migrateError } from './storage'
import type { ErrorRecord } from './types'

const data = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: key => data.delete(key),
  clear: () => data.clear(),
  key: index => [...data.keys()][index] ?? null,
  get length() { return data.size }
}

beforeEach(() => {
  data.clear()
  globalThis.localStorage = memoryStorage
})

describe('storage migration and deletion', () => {
  it('reads legacy history and writes it to the current key', () => {
    data.set('optistudy-store-v1', JSON.stringify({ version: 1, attempts: [{ id: 'old' }], profile: { priority: 'Reading', daysOff: [] } }))
    const store = loadStore()
    expect(store.attempts[0].id).toBe('old')
    expect(data.has('ielts-optimizer-store-v1')).toBe(true)
  })

  it('clears both current and legacy keys', () => {
    data.set('ielts-optimizer-store-v1', '{}')
    data.set('optistudy-store-v1', '{}')
    clearStore()
    expect(data.size).toBe(0)
  })

  it('pauses a recovered timer instead of counting closed-tab time', () => {
    data.set('ielts-optimizer-store-v1', JSON.stringify({ version: 1, activeSession: { id: 's', startedAt: '2026-01-01T10:00:00Z', lastResumedAt: '2026-01-01T10:00:00Z', accumulatedSeconds: 30, paused: false } }))
    expect(loadStore().activeSession?.paused).toBe(true)
  })

  it('preserves raw corrupted data on invalid JSON without silently overwriting with empty store', () => {
    const corruptedJSON = '{ "version": 1, "attempts": [broken_json...'
    data.set('ielts-optimizer-store-v1', corruptedJSON)

    const loaded = loadStore()
    expect(loaded.attempts).toHaveLength(0)

    // Verify raw corrupted data was NOT deleted or overwritten in storage
    expect(data.get('ielts-optimizer-store-v1')).toBe(corruptedJSON)
    expect(data.get('ielts-optimizer-corrupted-raw')).toBe(corruptedJSON)
  })

  it('preserves raw localStorage backup before applying migration', () => {
    const rawLegacy = JSON.stringify({
      version: 1,
      profile: { priority: 'Reading', daysOff: [] },
      errors: [{ id: 'legacy-err', objective: 'Identify the main idea', status: 'open' }]
    })
    data.set('ielts-optimizer-store-v1', rawLegacy)

    loadStore()
    expect(data.get('ielts-optimizer-store-raw-backup')).toBe(rawLegacy)
  })

  it('strictly validates invalid error statuses to open or resolved', () => {
    // 1. Invalid status 'fixed' with no retests -> strictly 'open'
    const err1 = migrateError({
      id: 'e1',
      objective: 'Identify the main idea',
      status: 'fixed_by_user',
      retestAttemptIds: []
    })
    expect(err1.status).toBe('open')
    expect(err1.resolvedAt).toBeUndefined()

    // 2. Invalid status 'pending' with retest -> 'resolved'
    const err2 = migrateError({
      id: 'e2',
      objective: 'Locate supporting detail',
      status: 'pending_review',
      retestAttemptIds: ['att-retest-ok'],
      resolvedAt: '2026-01-02T10:00:00Z'
    })
    expect(err2.status).toBe('resolved')
    expect(err2.resolvedAt).toBe('2026-01-02T10:00:00Z')
  })

  it('removes stale resolvedAt from open errors during migration', () => {
    const err = migrateError({
      id: 'e-stale',
      objective: 'Distinguish explicit contradiction',
      status: 'open',
      resolvedAt: '2026-01-01T10:00:00Z',
      resolvedAttemptId: 'att-old-retest'
    })
    expect(err.status).toBe('open')
    expect(err.resolvedAt).toBeUndefined()
    expect(err.resolvedAttemptId).toBeUndefined()
  })

  it('deduplicates duplicate error records sharing the same objective, preserving full attemptIds, occurrences, and resolution history', () => {
    const dup1: ErrorRecord = {
      id: 'err-urban-gardens-main',
      passageId: 'urban-gardens',
      questionId: 'q1',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      prompt: 'Prompt from passage 1',
      learnerAnswer: 'Answer 1',
      correctAnswer: 'Correct 1',
      explanation: 'Exp 1',
      createdAt: '2026-01-01T10:00:00Z',
      attemptId: 'att-1',
      attemptIds: ['att-1'],
      retestAttemptIds: ['ret-1'],
      status: 'resolved',
      resolvedAt: '2026-01-02T10:00:00Z',
      reviewCount: 1,
    }

    const dup2: ErrorRecord = {
      id: 'err-community-libraries-main',
      passageId: 'community-libraries',
      questionId: 'l1',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      prompt: 'Prompt from passage 2',
      learnerAnswer: 'Answer 2',
      correctAnswer: 'Correct 2',
      explanation: 'Exp 2',
      createdAt: '2026-01-05T10:00:00Z',
      attemptId: 'att-2',
      attemptIds: ['att-2'],
      retestAttemptIds: [],
      status: 'open',
      reviewCount: 2,
    }

    const deduped = deduplicateErrors([dup1, dup2])
    expect(deduped).toHaveLength(1)
    const merged = deduped[0]
    expect(merged.objectiveId).toBe('identify-main-idea')
    // Open status prevails when any duplicate is open
    expect(merged.status).toBe('open')
    expect(merged.resolvedAt).toBeUndefined()
    // History is merged without dropping any attempts
    expect(merged.attemptIds).toContain('att-1')
    expect(merged.attemptIds).toContain('att-2')
    expect(merged.retestAttemptIds).toContain('ret-1')
    expect(merged.reviewCount).toBe(2)
    // Preserves occurrences
    expect(merged.occurrences && merged.occurrences.length).toBeGreaterThanOrEqual(2)
  })
})
