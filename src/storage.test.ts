import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStore,
  CORRUPTED_RAW_KEY,
  deduplicateErrors,
  isCorruptedWithoutRecovery,
  KEY,
  LEGACY_KEY,
  loadStore,
  migrateError,
  saveStore
} from './storage'
import type { Attempt, ErrorRecord } from './types'

const data = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => { data.set(key, value) },
  removeItem: key => { data.delete(key) },
  clear: () => { data.clear() },
  key: index => [...data.keys()][index] ?? null,
  get length() { return data.size }
}

beforeEach(() => {
  data.clear()
  globalThis.localStorage = memoryStorage
})

describe('Retest outcome integrity & migration safety (Scope 1)', () => {
  it('1. Invalid status + failed Retest must not become resolved', () => {
    // 1a. Explicit failed outcome record
    const errWithFailedOutcome = migrateError({
      id: 'err-1',
      objective: 'Identify the main idea',
      status: 'pending_review',
      retestAttemptIds: ['ret-fail-1'],
      retestOutcomes: [{ attemptId: 'ret-fail-1', outcome: 'failed' }]
    })
    expect(errWithFailedOutcome.status).toBe('open')
    expect(errWithFailedOutcome.resolvedAt).toBeUndefined()
    expect(errWithFailedOutcome.resolvedAttemptId).toBeUndefined()

    // 1b. Failed attempt in attempts history (score: 0 / 1)
    const failedAttempt: Attempt = {
      id: 'ret-fail-2',
      passageId: 'urban-gardens-retest',
      skill: 'Reading',
      answers: { r1: 'wrong' },
      score: 0,
      total: 1,
      kind: 'retest',
      createdAt: '2026-02-01T10:00:00Z',
      objectiveIds: ['identify-main-idea']
    }
    const errWithFailedAttempt = migrateError(
      {
        id: 'err-2',
        objective: 'Identify the main idea',
        status: 'custom_status',
        retestAttemptIds: ['ret-fail-2']
      },
      [failedAttempt]
    )
    expect(errWithFailedAttempt.status).toBe('open')
    expect(errWithFailedAttempt.resolvedAt).toBeUndefined()
  })

  it('2. Invalid status + successful Retest with explicit verified evidence follows the documented policy', () => {
    // 2a. Explicit verified passing outcome
    const errWithPassOutcome = migrateError({
      id: 'err-pass-1',
      objective: 'Distinguish explicit contradiction',
      status: 'legacy_inconsistent_status',
      retestAttemptIds: ['ret-pass-1'],
      retestOutcomes: [{ attemptId: 'ret-pass-1', outcome: 'passed', timestamp: '2026-02-05T12:00:00Z' }],
      resolvedAt: '2026-02-05T12:00:00Z',
      resolvedAttemptId: 'ret-pass-1'
    })
    expect(errWithPassOutcome.status).toBe('resolved')
    expect(errWithPassOutcome.resolvedAt).toBe('2026-02-05T12:00:00Z')
    expect(errWithPassOutcome.resolvedAttemptId).toBe('ret-pass-1')

    // 2b. Explicit verified passing score in attempts history
    const passedAttempt: Attempt = {
      id: 'ret-pass-2',
      passageId: 'urban-gardens-retest',
      skill: 'Reading',
      answers: { r2: 'False' },
      score: 1,
      total: 1,
      kind: 'retest',
      createdAt: '2026-02-06T14:00:00Z',
      objectiveIds: ['distinguish-contradiction']
    }
    const errWithVerifiedAttempt = migrateError(
      {
        id: 'err-pass-2',
        objective: 'Distinguish explicit contradiction',
        status: 'unverified_status',
        retestAttemptIds: ['ret-pass-2'],
        resolvedAt: '2026-02-06T14:00:00Z',
        resolvedAttemptId: 'ret-pass-2'
      },
      [passedAttempt]
    )
    expect(errWithVerifiedAttempt.status).toBe('resolved')
    expect(errWithVerifiedAttempt.resolvedAt).toBe('2026-02-06T14:00:00Z')
  })

  it('3. Invalid status + Retest ID with unknown outcome must not become resolved', () => {
    // Merely having a retest ID without verified pass evidence must NOT mark it resolved!
    const errUnknown = migrateError({
      id: 'err-unknown',
      objective: 'Locate supporting detail',
      status: 'pending',
      retestAttemptIds: ['ret-unknown-attempt'],
      // No attempts provided, no verified outcome provided
    })
    expect(errUnknown.status).toBe('open')
    expect(errUnknown.resolvedAt).toBeUndefined()
    expect(errUnknown.resolvedAttemptId).toBeUndefined()
    expect(errUnknown.retestAttemptIds).toEqual(['ret-unknown-attempt'])
  })

  it('4. Reopening, repeated processing, and migration do not duplicate historical resolutions or lose attempt history', () => {
    const errorWithHistory: ErrorRecord = {
      id: 'err-lifecycle',
      questionId: 'q1',
      attemptId: 'att-1',
      attemptIds: ['att-1', 'ret-1', 'att-2'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      prompt: 'Prompt',
      learnerAnswer: 'Answer',
      correctAnswer: 'Correct',
      explanation: 'Explanation',
      createdAt: '2026-01-01T10:00:00Z',
      reviewCount: 2,
      retestAttemptIds: ['ret-1'],
      retestOutcomes: [{ attemptId: 'ret-1', outcome: 'passed', timestamp: '2026-01-02T10:00:00Z' }],
      status: 'open', // Reopened by att-2
      historicalResolutions: [
        { resolvedAt: '2026-01-02T10:00:00Z', resolvedAttemptId: 'ret-1' }
      ]
    }

    // Process through deduplication and multiple migration passes
    const pass1 = deduplicateErrors([errorWithHistory, errorWithHistory])
    expect(pass1).toHaveLength(1)
    expect(pass1[0].historicalResolutions).toHaveLength(1)
    expect(pass1[0].attemptIds).toEqual(['att-1', 'ret-1', 'att-2'])
    expect(pass1[0].retestAttemptIds).toEqual(['ret-1'])

    const pass2 = migrateError(pass1[0])
    expect(pass2.historicalResolutions).toHaveLength(1)
    expect(pass2.attemptIds).toEqual(['att-1', 'ret-1', 'att-2'])
    expect(pass2.retestAttemptIds).toEqual(['ret-1'])
  })
})

describe('Corrupted-store protection & recovery policy (Scope 2)', () => {
  it('prevents initial React effects / persistence from overwriting primary storage key after malformed JSON is detected', () => {
    const corruptedJSON = '{"version": 1, "profile": { broken_json_here...'
    data.set(KEY, corruptedJSON)

    // loadStore detects corrupted JSON
    const store = loadStore()
    expect(store.attempts).toHaveLength(0)
    expect(isCorruptedWithoutRecovery()).toBe(true)

    // Simulating React initial mount effect: useEffect(() => saveStore(s), [s])
    const saveResult = saveStore(store)
    expect(saveResult).toBe(false)

    // Verify KEY was NOT overwritten with empty fallback JSON!
    expect(data.get(KEY)).toBe(corruptedJSON)
    // Verify corrupted raw data was preserved in backup
    expect(data.get(CORRUPTED_RAW_KEY)).toBe(corruptedJSON)
  })

  it('recovers learner data from valid legacy store when primary store is corrupt, preserving raw corrupted primary data', () => {
    const corruptedPrimary = '{"corrupted": true, ...broken'
    const validLegacy = JSON.stringify({
      version: 1,
      profile: { priority: 'Reading', daysOff: [] },
      attempts: [{ id: 'legacy-attempt-recovered', score: 1, total: 1, kind: 'practice', createdAt: '2026-01-01T10:00:00Z', objectiveIds: [] }],
      errors: [],
      sessions: [],
      plan: []
    })

    data.set(KEY, corruptedPrimary)
    data.set(LEGACY_KEY, validLegacy)

    const recoveredStore = loadStore()
    expect(recoveredStore.attempts).toHaveLength(1)
    expect(recoveredStore.attempts[0].id).toBe('legacy-attempt-recovered')
    expect(isCorruptedWithoutRecovery()).toBe(false)

    // Primary store was safely updated with recovered store
    expect(data.get(KEY)).toContain('legacy-attempt-recovered')
    // Raw corrupted primary string was preserved
    expect(data.get(CORRUPTED_RAW_KEY)).toBe(corruptedPrimary)
  })

  it('allows normal persistence again after explicit clearStore/reset', () => {
    data.set(KEY, 'broken json')
    loadStore()
    expect(isCorruptedWithoutRecovery()).toBe(true)
    expect(saveStore(loadStore())).toBe(false)

    // User explicitly clears/resets
    clearStore()
    expect(isCorruptedWithoutRecovery()).toBe(false)
    expect(data.has(KEY)).toBe(false)

    // Fresh save succeeds
    const freshStore = loadStore()
    expect(saveStore(freshStore)).toBe(true)
    expect(data.has(KEY)).toBe(true)
  })

  it('preserves raw localStorage backup before applying migration', () => {
    const rawLegacy = JSON.stringify({
      version: 1,
      profile: { priority: 'Reading', daysOff: [] },
      errors: [{ id: 'legacy-err', objective: 'Identify the main idea', status: 'open' }]
    })
    data.set(KEY, rawLegacy)

    loadStore()
    expect(data.get('ielts-optimizer-store-raw-backup')).toBe(rawLegacy)
  })

  it('clears both current, legacy, and corrupted backup keys on clearStore', () => {
    data.set(KEY, '{}')
    data.set(LEGACY_KEY, '{}')
    data.set(CORRUPTED_RAW_KEY, 'bad')
    clearStore()
    expect(data.has(KEY)).toBe(false)
    expect(data.has(LEGACY_KEY)).toBe(false)
    expect(data.has(CORRUPTED_RAW_KEY)).toBe(false)
  })

  it('pauses a recovered timer instead of counting closed-tab time', () => {
    data.set(KEY, JSON.stringify({
      version: 1,
      activeSession: { id: 's', startedAt: '2026-01-01T10:00:00Z', lastResumedAt: '2026-01-01T10:00:00Z', accumulatedSeconds: 30, paused: false }
    }))
    expect(loadStore().activeSession?.paused).toBe(true)
  })
})
