import type { Attempt, ErrorOccurrence, ErrorRecord, HistoricalResolution, RetestOutcome, Store } from './types'
import { getObjectiveId } from './domain'

export const KEY = 'ielts-optimizer-store-v1'
export const LEGACY_KEY = 'optistudy-store-v1'
export const BACKUP_RAW_KEY = 'ielts-optimizer-store-raw-backup'
export const CORRUPTED_RAW_KEY = 'ielts-optimizer-corrupted-raw'

let unrecoveredCorruption = false

export const isCorruptedWithoutRecovery = (): boolean => unrecoveredCorruption
export const setCorruptedWithoutRecovery = (val: boolean): void => {
  unrecoveredCorruption = val
}

const empty: Store = {
  version: 1,
  profile: { daysOff: [], priority: 'Reading' },
  attempts: [],
  errors: [],
  sessions: [],
  plan: []
}

const validProfile = (p: any) => ({
  ...empty.profile,
  ...(p && typeof p === 'object' ? p : {}),
  daysOff: Array.isArray(p?.daysOff) ? p.daysOff : [],
  priority: ['Reading', 'Listening', 'Writing', 'Speaking'].includes(p?.priority) ? p.priority : 'Reading',
  dailyGoalMinutes: typeof p?.dailyGoalMinutes === 'number' && p.dailyGoalMinutes >= 0 && p.dailyGoalMinutes <= 1440 ? p.dailyGoalMinutes : undefined,
  targetBand: typeof p?.targetBand === 'number' && p.targetBand >= 1 && p.targetBand <= 9 ? p.targetBand : undefined
})

/**
 * Conservative Migration Policy for Retest Outcomes:
 *
 * 1. Valid existing status ('open' | 'resolved') is preserved when supported by data.
 *    If status is 'open', any stale resolvedAt / resolvedAttemptId metadata is cleared.
 * 2. Missing or invalid status:
 *    A Retest attempt ID proves that an attempt occurred, NOT that the learner passed it.
 *    We never infer resolved status merely from retestAttemptIds.length > 0.
 *    We ONLY mark resolved if there is explicit verified evidence of success:
 *      a) An explicit retestOutcomes entry with outcome === 'passed'
 *      b) A retest attempt in attempts history matching an ID in retestAttemptIds with score === total (and total > 0)
 *      c) A resolvedAttemptId verified against historicalResolutions or attempts history
 *    If evidence shows failed or unknown retests, or no verified pass exists, status is strictly 'open'.
 */
export const migrateError = (e: any, attempts?: Attempt[]): ErrorRecord => {
  const objective = e.objective || 'Identify the main idea'
  const objectiveId = e.objectiveId || getObjectiveId({ objectiveId: e.objectiveId, objective })

  const attemptIds: string[] = Array.isArray(e.attemptIds) && e.attemptIds.length > 0
    ? Array.from(new Set(e.attemptIds))
    : [e.attemptId || e.id || 'unknown']

  const retestAttemptIds: string[] = Array.isArray(e.retestAttemptIds)
    ? Array.from(new Set(e.retestAttemptIds))
    : []

  const retestOutcomes: RetestOutcome[] = Array.isArray(e.retestOutcomes)
    ? e.retestOutcomes.map((o: any) => ({
        attemptId: String(o.attemptId || 'unknown'),
        outcome: (o.outcome === 'passed' || o.outcome === 'failed' || o.outcome === 'unknown') ? o.outcome : 'unknown',
        timestamp: typeof o.timestamp === 'string' ? o.timestamp : undefined
      }))
    : []

  let status: 'open' | 'resolved'
  if (e.status === 'open' || e.status === 'resolved') {
    status = e.status
  } else {
    // Missing or invalid status: apply conservative migration policy
    let hasVerifiedPass = false

    // Check explicit retest outcomes
    if (retestOutcomes.some(o => o.outcome === 'passed')) {
      hasVerifiedPass = true
    }

    // Check attempts history for verified score
    if (!hasVerifiedPass && Array.isArray(attempts) && retestAttemptIds.length > 0) {
      hasVerifiedPass = attempts.some(a =>
        a.kind === 'retest' &&
        retestAttemptIds.includes(a.id) &&
        a.total > 0 &&
        a.score === a.total
      )
    }

    // Check resolvedAttemptId
    if (!hasVerifiedPass && typeof e.resolvedAttemptId === 'string' && e.resolvedAttemptId.length > 0) {
      if (Array.isArray(e.historicalResolutions) && e.historicalResolutions.some((h: any) => h?.resolvedAttemptId === e.resolvedAttemptId)) {
        hasVerifiedPass = true
      } else if (Array.isArray(attempts)) {
        hasVerifiedPass = attempts.some(a => a.id === e.resolvedAttemptId && a.total > 0 && a.score === a.total)
      }
    }

    status = hasVerifiedPass ? 'resolved' : 'open'
  }

  // Clear stale resolution metadata if status is open
  const resolvedAt = status === 'open' ? undefined : (typeof e.resolvedAt === 'string' ? e.resolvedAt : undefined)
  const resolvedAttemptId = status === 'open' ? undefined : (typeof e.resolvedAttemptId === 'string' ? e.resolvedAttemptId : undefined)

  const baseOcc: ErrorOccurrence = {
    attemptId: e.attemptId || attemptIds[0],
    passageId: e.passageId || 'unknown',
    questionId: e.questionId || 'unknown',
    type: e.type || 'multiple-choice',
    prompt: e.prompt || '',
    learnerAnswer: e.learnerAnswer || 'No answer',
    correctAnswer: e.correctAnswer || '',
    explanation: e.explanation || '',
    createdAt: e.createdAt || new Date().toISOString(),
  }

  const occurrences: ErrorOccurrence[] = Array.isArray(e.occurrences) && e.occurrences.length > 0
    ? e.occurrences
    : [baseOcc]

  const originalContext: ErrorOccurrence = e.originalContext || occurrences[0] || baseOcc
  const latestContext: ErrorOccurrence = e.latestContext || occurrences[occurrences.length - 1] || baseOcc

  const historicalResolutions: HistoricalResolution[] = Array.isArray(e.historicalResolutions)
    ? e.historicalResolutions
    : (status === 'resolved' && resolvedAt ? [{ resolvedAt, resolvedAttemptId }] : [])

  return {
    ...e,
    id: e.id || `err-${e.passageId || 'legacy'}-${objectiveId}`,
    questionId: latestContext.questionId || e.questionId || 'unknown',
    attemptId: latestContext.attemptId || e.attemptId || attemptIds[0],
    attemptIds,
    passageId: latestContext.passageId || e.passageId || 'unknown',
    type: latestContext.type || e.type || 'multiple-choice',
    objective,
    objectiveId,
    prompt: latestContext.prompt || e.prompt || '',
    learnerAnswer: latestContext.learnerAnswer || e.learnerAnswer || 'No answer',
    correctAnswer: latestContext.correctAnswer || e.correctAnswer || '',
    explanation: latestContext.explanation || e.explanation || '',
    createdAt: e.createdAt || latestContext.createdAt || new Date().toISOString(),
    reviewCount: typeof e.reviewCount === 'number' ? e.reviewCount : 0,
    retestAttemptIds,
    retestOutcomes,
    status,
    resolvedAt,
    resolvedAttemptId,
    originalContext,
    latestContext,
    occurrences,
    historicalResolutions,
  }
}

/**
 * Deduplicate ErrorRecords according to the defined policy:
 * One ErrorRecord per objective with a history of distinct error occurrences.
 */
export const deduplicateErrors = (errors: ErrorRecord[]): ErrorRecord[] => {
  const byObjective = new Map<string, ErrorRecord>()

  for (const err of errors) {
    const key = err.objectiveId
    const existing = byObjective.get(key)
    if (!existing) {
      byObjective.set(key, err)
      continue
    }

    const getOccs = (e: ErrorRecord): ErrorOccurrence[] => {
      if (e.occurrences && e.occurrences.length > 0) return e.occurrences
      return [{
        attemptId: e.attemptId || (e.attemptIds && e.attemptIds[0]) || 'unknown',
        passageId: e.passageId || 'unknown',
        questionId: e.questionId || 'unknown',
        type: e.type || 'multiple-choice',
        prompt: e.prompt || '',
        learnerAnswer: e.learnerAnswer || 'No answer',
        correctAnswer: e.correctAnswer || '',
        explanation: e.explanation || '',
        createdAt: e.createdAt || new Date().toISOString(),
      }]
    }

    // Merge duplicate records without losing history or occurrences
    const combinedAttemptIds = Array.from(new Set([...(existing.attemptIds || []), ...(err.attemptIds || [])]))
    const combinedRetests = Array.from(new Set([...(existing.retestAttemptIds || []), ...(err.retestAttemptIds || [])]))

    // Merge retest outcomes without duplicates
    const outcomeMap = new Map<string, RetestOutcome>()
    for (const o of [...(existing.retestOutcomes || []), ...(err.retestOutcomes || [])]) {
      if (o && o.attemptId) {
        outcomeMap.set(o.attemptId, o)
      }
    }
    const combinedOutcomes = Array.from(outcomeMap.values())

    // Merge occurrences without duplicating identical records
    const occMap = new Map<string, ErrorOccurrence>()
    for (const occ of [...getOccs(existing), ...getOccs(err)]) {
      const occKey = `${occ.attemptId || 'no-att'}-${occ.questionId || 'no-q'}-${occ.createdAt || ''}`
      occMap.set(occKey, occ)
    }
    const combinedOccurrences = Array.from(occMap.values())

    // Merge resolutions without duplicating timestamps
    const resMap = new Map<string, HistoricalResolution>()
    for (const r of [...(existing.historicalResolutions || []), ...(err.historicalResolutions || [])]) {
      if (r && r.resolvedAt) {
        resMap.set(r.resolvedAt, r)
      }
    }
    const combinedResolutions = Array.from(resMap.values())

    // Status policy: if any duplicate record is open, the overall error remains open
    const isOpen = existing.status === 'open' || err.status === 'open'
    const status: 'open' | 'resolved' = isOpen ? 'open' : 'resolved'

    const originalContext = existing.originalContext || err.originalContext || getOccs(existing)[0]
    const latestContext = err.latestContext || existing.latestContext || getOccs(err)[0]

    byObjective.set(key, {
      ...existing,
      id: existing.id,
      status,
      resolvedAt: status === 'open' ? undefined : (err.resolvedAt || existing.resolvedAt),
      resolvedAttemptId: status === 'open' ? undefined : (err.resolvedAttemptId || existing.resolvedAttemptId),
      attemptIds: combinedAttemptIds,
      retestAttemptIds: combinedRetests,
      retestOutcomes: combinedOutcomes,
      occurrences: combinedOccurrences,
      historicalResolutions: combinedResolutions,
      originalContext,
      latestContext,
      // Synchronize top-level fields with latest context
      prompt: latestContext?.prompt || existing.prompt,
      learnerAnswer: latestContext?.learnerAnswer || existing.learnerAnswer,
      correctAnswer: latestContext?.correctAnswer || existing.correctAnswer,
      explanation: latestContext?.explanation || existing.explanation,
      passageId: latestContext?.passageId || existing.passageId,
      questionId: latestContext?.questionId || existing.questionId,
      reviewCount: Math.max(existing.reviewCount || 0, err.reviewCount || 0),
    })
  }

  return Array.from(byObjective.values())
}

const migrateAttempt = (a: any): Attempt => ({
  ...a,
  objectiveIds: Array.isArray(a.objectiveIds) ? a.objectiveIds : [],
  targetErrorIds: Array.isArray(a.targetErrorIds) ? a.targetErrorIds : undefined,
})

export const restoreStore = (parsed: any): Store => {
  const rawAttempts = Array.isArray(parsed.attempts) ? parsed.attempts.map(migrateAttempt) : []
  const rawErrors = Array.isArray(parsed.errors) ? parsed.errors.map((e: any) => migrateError(e, rawAttempts)) : []
  const dedupedErrors = deduplicateErrors(rawErrors)

  return {
    ...empty,
    ...parsed,
    version: 1 as const,
    profile: validProfile(parsed.profile),
    attempts: rawAttempts,
    errors: dedupedErrors,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    plan: Array.isArray(parsed.plan) ? parsed.plan : [],
    activeSession: parsed.activeSession ? { ...parsed.activeSession, paused: true } : undefined
  }
}

/**
 * Storage Recovery & Loading Policy:
 *
 * 1. If primary key ('ielts-optimizer-store-v1') exists and parses successfully:
 *    Snapshot raw string to BACKUP_RAW_KEY before migration, migrate safely, and persist.
 * 2. If primary key exists but contains corrupted JSON:
 *    - Immediately snapshot raw corrupted string to CORRUPTED_RAW_KEY without overwriting primary key.
 *    - Check if valid legacy store ('optistudy-store-v1') exists:
 *      If legacy is valid JSON, recover all learner data from legacy, migrate, and save to primary KEY.
 *    - If legacy is not valid or unavailable:
 *      Mark unrecoveredCorruption = true and return in-memory empty fallback store.
 *      Prevent automatic persistence until recovery or explicit reset!
 * 3. If primary key does not exist but legacy exists:
 *    Recover from legacy, save to primary KEY.
 */
export const loadStore = (): Store => {
  const rawPrimary = localStorage.getItem(KEY)
  const rawLegacy = localStorage.getItem(LEGACY_KEY)

  // 1. Primary key exists
  if (rawPrimary !== null) {
    try {
      const parsedPrimary = JSON.parse(rawPrimary)
      unrecoveredCorruption = false

      // Preserve raw snapshot before migration
      try {
        localStorage.setItem(BACKUP_RAW_KEY, rawPrimary)
      } catch {}

      const restored = restoreStore(parsedPrimary)
      try {
        localStorage.setItem(KEY, JSON.stringify(restored))
      } catch {}

      return restored
    } catch (primaryErr) {
      // Primary is corrupt JSON!
      // Immediately preserve raw primary data in CORRUPTED_RAW_KEY
      try {
        localStorage.setItem(CORRUPTED_RAW_KEY, rawPrimary)
      } catch {}

      // Documented Recovery Policy: Check if valid legacy store exists to recover from
      if (rawLegacy !== null) {
        try {
          const parsedLegacy = JSON.parse(rawLegacy)
          unrecoveredCorruption = false
          const restored = restoreStore(parsedLegacy)
          try {
            localStorage.setItem(KEY, JSON.stringify(restored))
          } catch {}
          return restored
        } catch (legacyErr) {
          // Legacy is also corrupt
        }
      }

      // Both/primary corrupt: prevent automatic persistence of fallback empty store!
      unrecoveredCorruption = true
      return structuredClone(empty)
    }
  }

  // 2. Primary does not exist, but legacy exists
  if (rawLegacy !== null) {
    try {
      const parsedLegacy = JSON.parse(rawLegacy)
      unrecoveredCorruption = false

      try {
        localStorage.setItem(BACKUP_RAW_KEY, rawLegacy)
      } catch {}

      const restored = restoreStore(parsedLegacy)
      try {
        localStorage.setItem(KEY, JSON.stringify(restored))
      } catch {}
      return restored
    } catch (legacyErr) {
      try {
        localStorage.setItem(CORRUPTED_RAW_KEY, rawLegacy)
      } catch {}
      unrecoveredCorruption = true
      return structuredClone(empty)
    }
  }

  // 3. Fresh start
  unrecoveredCorruption = false
  return structuredClone(empty)
}

export const saveStore = (s: Store): boolean => {
  // Prevent automatic persistence of empty fallback store if corruption was detected without recovery
  if (unrecoveredCorruption) {
    return false
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export const clearStore = () => {
  localStorage.removeItem(KEY)
  localStorage.removeItem(LEGACY_KEY)
  localStorage.removeItem(CORRUPTED_RAW_KEY)
  unrecoveredCorruption = false
}
