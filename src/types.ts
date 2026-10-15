export type Skill = 'Reading' | 'Listening' | 'Writing' | 'Speaking'
export type QuestionType = 'multiple-choice' | 'true-false-not-given'
export type Page = 'dashboard' | 'plan' | 'practice' | 'errors' | 'record' | 'network' | 'design' | 'profile'
export type Profile = { targetBand?: number; currentLevel?: string; examDate?: string; dailyGoalMinutes?: number; daysOff: string[]; priority: Skill }
export type Question = { id: string; type: QuestionType; prompt: string; options: string[]; answer: string; explanation: string; objective: string; objectiveId?: string }
export type Passage = { id: string; title: string; level: string; minutes: number; text: string; questions: Question[]; kind?: 'practice' | 'retest' }
export type Reflection = { evidence?: string; strategy?: string; mismatch?: string; nextStep?: string }
export type Attempt = { id: string; passageId: string; skill: Skill; answers: Record<string, string>; score: number; total: number; kind: 'practice' | 'retest'; createdAt: string; objectiveIds: string[]; targetErrorIds?: string[]; targetObjectiveId?: string; reflection?: Reflection }

/**
 * Explicit Data Model Policy:
 * One ErrorRecord per objective with a history of distinct error occurrences.
 * 
 * - Stable learning objective identity: objectiveId
 * - Stable ErrorRecord identity: id (persists across retests and subsequent failures)
 * - Original error context: originalContext (passageId, questionId, prompt, learnerAnswer, correctAnswer, explanation)
 * - Latest failure context: latestContext (matches the most recent failed attempt context)
 * - Occurrences history: occurrences[] (tracks every failed question attempt with its full context)
 * - Attempt history: attemptIds[] and retestAttemptIds[]
 * - Resolution lifecycle: 
 *     Passing retest -> status: 'resolved', resolvedAt, resolvedAttemptId
 *     Subsequent failure / reopening -> status: 'open', resolvedAt & resolvedAttemptId cleared, historicalResolutions preserved
 * - Top-level display fields (prompt, learnerAnswer, correctAnswer, explanation, passageId, questionId):
 *     Always synchronized to latestContext so displayed prompt and learner answer NEVER come from different passages!
 */
export type ErrorOccurrence = {
  attemptId: string
  passageId: string
  questionId: string
  type: QuestionType
  prompt: string
  learnerAnswer: string
  correctAnswer: string
  explanation: string
  createdAt: string
}

export type HistoricalResolution = {
  resolvedAt: string
  resolvedAttemptId?: string
}

export type RetestOutcome = {
  attemptId: string
  outcome: 'passed' | 'failed' | 'unknown'
  timestamp?: string
}

export type ErrorRecord = {
  id: string
  questionId: string
  attemptId: string
  attemptIds?: string[]
  passageId: string
  type: QuestionType
  objective: string
  objectiveId: string
  prompt?: string
  learnerAnswer: string
  correctAnswer: string
  explanation: string
  createdAt: string
  reviewCount: number
  retestAttemptIds: string[]
  retestOutcomes?: RetestOutcome[]
  status: 'open' | 'resolved'
  resolvedAt?: string
  resolvedAttemptId?: string
  originalContext?: ErrorOccurrence
  latestContext?: ErrorOccurrence
  occurrences?: ErrorOccurrence[]
  historicalResolutions?: HistoricalResolution[]
}

export type StudySession = { id: string; startedAt: string; endedAt: string; minutes: number; activity?: string; skill?: Skill }
export type PlanItem = { id: string; date: string; title: string; skill: Skill; objective: string; minutes: number; status: 'planned' | 'done' | 'skipped'; reason?: string; source?: 'manual' | 'recommended' }
export type ActiveSession = { id: string; startedAt: string; lastResumedAt: string; accumulatedSeconds: number; paused: boolean }
export type Store = { version: 1; profile: Profile; attempts: Attempt[]; errors: ErrorRecord[]; sessions: StudySession[]; plan: PlanItem[]; activeSession?: ActiveSession }
