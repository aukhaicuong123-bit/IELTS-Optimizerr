import type { Attempt, ErrorOccurrence, ErrorRecord, HistoricalResolution, Store } from './types'
import { getObjectiveId } from './domain'

const KEY = 'ielts-optimizer-store-v1'
const LEGACY_KEY = 'optistudy-store-v1'
const BACKUP_RAW_KEY = 'ielts-optimizer-store-raw-backup'
const CORRUPTED_RAW_KEY = 'ielts-optimizer-corrupted-raw'

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

export const migrateError = (e: any): ErrorRecord => {
  const objective = e.objective || 'Identify the main idea'
  const objectiveId = e.objectiveId || getObjectiveId({ objectiveId: e.objectiveId, objective })

  // Validate status strictly as 'open' or 'resolved'
  let status: 'open' | 'resolved'
  if (e.status === 'open' || e.status === 'resolved') {
    status = e.status
  } else {
    // Legacy fallback based strictly on whether successful retests exist
    const hasSuccessfulRetest = Array.isArray(e.retestAttemptIds) && e.retestAttemptIds.length > 0
    status = hasSuccessfulRetest ? 'resolved' : 'open'
  }

  // Clear stale resolution metadata if status is open
  const resolvedAt = status === 'open' ? undefined : (typeof e.resolvedAt === 'string' ? e.resolvedAt : undefined)
  const resolvedAttemptId = status === 'open' ? undefined : (typeof e.resolvedAttemptId === 'string' ? e.resolvedAttemptId : undefined)

  const attemptIds: string[] = Array.isArray(e.attemptIds) && e.attemptIds.length > 0
    ? Array.from(new Set(e.attemptIds))
    : [e.attemptId || e.id || 'unknown']

  const retestAttemptIds: string[] = Array.isArray(e.retestAttemptIds)
    ? Array.from(new Set(e.retestAttemptIds))
    : []

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
    const combinedOccurrences = [...getOccs(existing), ...getOccs(err)]
    const combinedResolutions = [...(existing.historicalResolutions || []), ...(err.historicalResolutions || [])]

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

export const loadStore = (): Store => {
  const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY)
  if (!raw) return structuredClone(empty)

  let x: any
  try {
    x = JSON.parse(raw)
  } catch (err) {
    // NEVER silently replace unreadable data with an empty Store.
    // Preserve the raw unreadable string in a corrupted backup key so no learner data is wiped!
    try {
      localStorage.setItem(CORRUPTED_RAW_KEY, raw)
    } catch {
      // ignore backup write failure
    }
    // Return empty in-memory store for graceful degradation without overwriting KEY
    return structuredClone(empty)
  }

  try {
    // Preserve raw data snapshot before executing migration
    localStorage.setItem(BACKUP_RAW_KEY, raw)
  } catch {
    // ignore backup write failure
  }

  const rawErrors = Array.isArray(x.errors) ? x.errors.map(migrateError) : []
  const dedupedErrors = deduplicateErrors(rawErrors)

  const restored: Store = {
    ...empty,
    ...x,
    version: 1 as const,
    profile: validProfile(x.profile),
    attempts: Array.isArray(x.attempts) ? x.attempts.map(migrateAttempt) : [],
    errors: dedupedErrors,
    sessions: Array.isArray(x.sessions) ? x.sessions : [],
    plan: Array.isArray(x.plan) ? x.plan : [],
    activeSession: x.activeSession ? { ...x.activeSession, paused: true } : undefined
  }

  // Safely persist migrated store
  try {
    localStorage.setItem(KEY, JSON.stringify(restored))
  } catch {
    // ignore storage quota errors
  }

  return restored
}

export const saveStore = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))
export const clearStore = () => {
  localStorage.removeItem(KEY)
  localStorage.removeItem(LEGACY_KEY)
}
