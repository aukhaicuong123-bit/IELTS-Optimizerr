import type { Attempt, ErrorRecord, Store } from './types'
import { getObjectiveId } from './domain'

const KEY = 'ielts-optimizer-store-v1'
const LEGACY_KEY = 'optistudy-store-v1'
const empty: Store = { version: 1, profile: { daysOff: [], priority: 'Reading' }, attempts: [], errors: [], sessions: [], plan: [] }

const validProfile = (p: any) => ({
  ...empty.profile,
  ...(p && typeof p === 'object' ? p : {}),
  daysOff: Array.isArray(p?.daysOff) ? p.daysOff : [],
  priority: ['Reading', 'Listening', 'Writing', 'Speaking'].includes(p?.priority) ? p.priority : 'Reading',
  dailyGoalMinutes: typeof p?.dailyGoalMinutes === 'number' && p.dailyGoalMinutes >= 0 && p.dailyGoalMinutes <= 1440 ? p.dailyGoalMinutes : undefined,
  targetBand: typeof p?.targetBand === 'number' && p.targetBand >= 1 && p.targetBand <= 9 ? p.targetBand : undefined
})

const migrateError = (e: any): ErrorRecord => {
  const objective = e.objective || 'Identify the main idea'
  const objectiveId = e.objectiveId || getObjectiveId({ objectiveId: e.objectiveId, objective })
  const status: 'open' | 'resolved' = e.status
    ? e.status
    : (Array.isArray(e.retestAttemptIds) && e.retestAttemptIds.length > 0 ? 'resolved' : 'open')
  return {
    ...e,
    objective,
    objectiveId,
    status,
    attemptIds: Array.isArray(e.attemptIds) && e.attemptIds.length > 0 ? e.attemptIds : [e.attemptId || e.id],
    retestAttemptIds: Array.isArray(e.retestAttemptIds) ? e.retestAttemptIds : [],
    reviewCount: typeof e.reviewCount === 'number' ? e.reviewCount : 0,
  }
}

const migrateAttempt = (a: any): Attempt => ({
  ...a,
  objectiveIds: Array.isArray(a.objectiveIds) ? a.objectiveIds : [],
  targetErrorIds: Array.isArray(a.targetErrorIds) ? a.targetErrorIds : undefined,
})

export const loadStore = (): Store => {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return structuredClone(empty)
    const x = JSON.parse(raw)
    const restored: Store = {
      ...empty,
      ...x,
      version: 1 as const,
      profile: validProfile(x.profile),
      attempts: Array.isArray(x.attempts) ? x.attempts.map(migrateAttempt) : [],
      errors: Array.isArray(x.errors) ? x.errors.map(migrateError) : [],
      sessions: Array.isArray(x.sessions) ? x.sessions : [],
      plan: Array.isArray(x.plan) ? x.plan : [],
      activeSession: x.activeSession ? { ...x.activeSession, paused: true } : undefined
    }
    localStorage.setItem(KEY, JSON.stringify(restored))
    return restored
  } catch {
    return structuredClone(empty)
  }
}

export const saveStore = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))
export const clearStore = () => {
  localStorage.removeItem(KEY)
  localStorage.removeItem(LEGACY_KEY)
}
