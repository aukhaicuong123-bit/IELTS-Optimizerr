import type { Attempt, ErrorOccurrence, ErrorRecord, HistoricalResolution, Passage, PlanItem, Profile, Question, StudySession } from './types'

/**
 * Explicit Policy: One ErrorRecord per objective with a history of distinct error occurrences.
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

export const normalizeObjectiveId = (obj: string): string =>
  obj.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const getObjectiveId = (q: { objectiveId?: string; objective: string }): string => {
  if (q.objectiveId) return q.objectiveId
  const norm = q.objective.toLowerCase().trim()
  if (norm.includes('main idea')) return 'identify-main-idea'
  if (norm.includes('contradiction')) return 'distinguish-contradiction'
  if (norm.includes('missing')) return 'recognise-missing-info'
  if (norm.includes('supporting') || norm.includes('detail')) return 'locate-supporting-detail'
  return normalizeObjectiveId(q.objective)
}

export const isErrorOpen = (e: ErrorRecord): boolean => {
  if (e.status) return e.status === 'open'
  return !e.retestAttemptIds || e.retestAttemptIds.length === 0
}

export const isErrorResolved = (e: ErrorRecord): boolean => !isErrorOpen(e)

export const scoreAttempt = (questions: Question[], answers: Record<string, string>) =>
  questions.reduce((n, q) => n + (answers[q.id] === q.answer ? 1 : 0), 0)

export const makeOccurrence = (attempt: Attempt, q: Question): ErrorOccurrence => ({
  attemptId: attempt.id,
  passageId: attempt.passageId,
  questionId: q.id,
  type: q.type,
  prompt: q.prompt,
  learnerAnswer: attempt.answers[q.id] || 'No answer',
  correctAnswer: q.answer,
  explanation: q.explanation,
  createdAt: attempt.createdAt,
})

export const makeErrors = (attempt: Attempt, questions: Question[]): ErrorRecord[] =>
  questions
    .filter(q => attempt.answers[q.id] !== q.answer)
    .map(q => {
      const objId = getObjectiveId(q)
      const occ = makeOccurrence(attempt, q)
      return {
        id: `err-${attempt.passageId}-${objId}`,
        questionId: q.id,
        attemptId: attempt.id,
        attemptIds: [attempt.id],
        passageId: attempt.passageId,
        type: q.type,
        objective: q.objective,
        objectiveId: objId,
        prompt: q.prompt,
        learnerAnswer: occ.learnerAnswer,
        correctAnswer: q.answer,
        explanation: q.explanation,
        createdAt: attempt.createdAt,
        reviewCount: 0,
        retestAttemptIds: [],
        status: 'open' as const,
        resolvedAt: undefined,
        resolvedAttemptId: undefined,
        originalContext: occ,
        latestContext: occ,
        occurrences: [occ],
        historicalResolutions: [],
      }
    })

export const mergeAttemptErrors = (
  existing: ErrorRecord[],
  attempt: Attempt,
  questions: Question[]
): ErrorRecord[] => {
  const result: ErrorRecord[] = existing.map(e => {
    const objId = e.objectiveId || getObjectiveId(e)
    const status: 'open' | 'resolved' = e.status === 'resolved' || e.status === 'open'
      ? e.status
      : (e.retestAttemptIds && e.retestAttemptIds.length > 0 ? 'resolved' : 'open')

    const baseOcc: ErrorOccurrence = {
      attemptId: e.attemptId || (e.attemptIds && e.attemptIds[0]) || 'unknown',
      passageId: e.passageId || 'unknown',
      questionId: e.questionId || 'unknown',
      type: e.type || 'multiple-choice',
      prompt: e.prompt || '',
      learnerAnswer: e.learnerAnswer || 'No answer',
      correctAnswer: e.correctAnswer || '',
      explanation: e.explanation || '',
      createdAt: e.createdAt || new Date().toISOString(),
    }

    return {
      ...e,
      objectiveId: objId,
      attemptIds: [...(e.attemptIds || (e.attemptId ? [e.attemptId] : []))],
      retestAttemptIds: [...(e.retestAttemptIds || [])],
      status,
      resolvedAt: status === 'open' ? undefined : e.resolvedAt,
      resolvedAttemptId: status === 'open' ? undefined : e.resolvedAttemptId,
      originalContext: e.originalContext || baseOcc,
      latestContext: e.latestContext || baseOcc,
      occurrences: e.occurrences && e.occurrences.length > 0 ? [...e.occurrences] : [baseOcc],
      historicalResolutions: e.historicalResolutions && e.historicalResolutions.length > 0
        ? [...e.historicalResolutions]
        : (e.resolvedAt ? [{ resolvedAt: e.resolvedAt, resolvedAttemptId: e.resolvedAttemptId }] : []),
    }
  })

  const isRetest = attempt.kind === 'retest'
  const targetErrorIds = attempt.targetErrorIds && attempt.targetErrorIds.length > 0 ? attempt.targetErrorIds : undefined
  const targetObjectiveId = attempt.targetObjectiveId

  for (const q of questions) {
    const qObjId = getObjectiveId(q)
    const isCorrect = attempt.answers[q.id] === q.answer

    if (isRetest) {
      // Find the specific error being targeted by this retest attempt
      let matchedError: ErrorRecord | undefined
      if (targetErrorIds) {
        matchedError = result.find(e => targetErrorIds.includes(e.id) && getObjectiveId(e) === qObjId)
        if (!matchedError && targetErrorIds.length === 1 && questions.length === 1) {
          matchedError = result.find(e => targetErrorIds.includes(e.id))
        }
      } else if (targetObjectiveId) {
        matchedError = result.find(e => getObjectiveId(e) === targetObjectiveId && getObjectiveId(e) === qObjId)
      } else {
        matchedError = result.find(e => getObjectiveId(e) === qObjId)
      }

      if (matchedError) {
        // Complete related attempt history: record all retests (success and failure) in attemptIds
        if (!matchedError.attemptIds?.includes(attempt.id)) {
          matchedError.attemptIds = [...(matchedError.attemptIds || []), attempt.id]
        }
        if (!matchedError.retestAttemptIds.includes(attempt.id)) {
          matchedError.retestAttemptIds.push(attempt.id)
        }

        if (isCorrect) {
          matchedError.status = 'resolved'
          matchedError.resolvedAt = attempt.createdAt
          matchedError.resolvedAttemptId = attempt.id
          matchedError.historicalResolutions = [
            ...(matchedError.historicalResolutions || []),
            { resolvedAt: attempt.createdAt, resolvedAttemptId: attempt.id }
          ]
        } else {
          // Failed retest keeps error open or reopens it
          if (matchedError.status === 'resolved' && matchedError.resolvedAt) {
            const alreadySaved = matchedError.historicalResolutions?.some(h => h.resolvedAt === matchedError.resolvedAt)
            if (!alreadySaved) {
              matchedError.historicalResolutions = [
                ...(matchedError.historicalResolutions || []),
                { resolvedAt: matchedError.resolvedAt, resolvedAttemptId: matchedError.resolvedAttemptId }
              ]
            }
          }
          matchedError.status = 'open'
          // Remove stale current-resolution metadata
          matchedError.resolvedAt = undefined
          matchedError.resolvedAttemptId = undefined
          matchedError.attemptId = attempt.id
          matchedError.createdAt = attempt.createdAt

          const occ = makeOccurrence(attempt, q)
          matchedError.latestContext = occ
          matchedError.occurrences = [...(matchedError.occurrences || []), occ]
          // Keep displayed question and learner answer internally consistent
          matchedError.prompt = occ.prompt
          matchedError.learnerAnswer = occ.learnerAnswer
          matchedError.correctAnswer = occ.correctAnswer
          matchedError.explanation = occ.explanation
          matchedError.passageId = occ.passageId
          matchedError.questionId = occ.questionId
          matchedError.type = occ.type
        }
      }
    } else {
      // Ordinary practice attempt
      const old = result.find(e => getObjectiveId(e) === qObjId)
      if (!isCorrect) {
        const occ = makeOccurrence(attempt, q)
        if (old) {
          // Reopen or keep open, record the new attempt occurrence
          if (old.status === 'resolved' && old.resolvedAt) {
            const alreadySaved = old.historicalResolutions?.some(h => h.resolvedAt === old.resolvedAt)
            if (!alreadySaved) {
              old.historicalResolutions = [
                ...(old.historicalResolutions || []),
                { resolvedAt: old.resolvedAt, resolvedAttemptId: old.resolvedAttemptId }
              ]
            }
          }
          old.status = 'open'
          // Clear stale resolution metadata on reopening
          old.resolvedAt = undefined
          old.resolvedAttemptId = undefined
          old.attemptId = attempt.id
          if (!old.attemptIds?.includes(attempt.id)) {
            old.attemptIds = [...(old.attemptIds || []), attempt.id]
          }
          old.createdAt = attempt.createdAt
          old.latestContext = occ
          old.occurrences = [...(old.occurrences || []), occ]

          // Keep displayed question, prompt, answer, explanation internally consistent:
          old.prompt = occ.prompt
          old.learnerAnswer = occ.learnerAnswer
          old.correctAnswer = occ.correctAnswer
          old.explanation = occ.explanation
          old.passageId = occ.passageId
          old.questionId = occ.questionId
          old.type = occ.type
        } else {
          const newErrors = makeErrors(attempt, [q])
          if (newErrors[0]) {
            result.push(newErrors[0])
          }
        }
      }
    }
  }

  return result
}

export const getRetestQuestions = (passage: Passage, targetObjectiveIds: string[]): Question[] => {
  if (!targetObjectiveIds || targetObjectiveIds.length === 0) return []
  return passage.questions.filter(q => targetObjectiveIds.includes(getObjectiveId(q)))
}

export const canSubmitRetest = (isRetest: boolean, activeQuestions: Question[]): boolean => {
  if (!isRetest) return activeQuestions.length > 0
  return activeQuestions.length > 0
}

export const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA')

export const startOfLocalWeek = (date: Date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export const minutesByDate = (sessions: StudySession[]) =>
  sessions.reduce<Record<string, number>>((a, s) => {
    const startMs = new Date(s.startedAt).getTime(),
      endMs = new Date(s.endedAt).getTime()
    if (!Number.isFinite(startMs)) return a
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      const date = localDate(s.startedAt)
      a[date] = (a[date] || 0) + Math.max(0, s.minutes)
      return a
    }
    let cursor = startMs
    const end = Math.max(endMs, startMs + Math.max(0, s.minutes) * 60000)
    while (cursor < end) {
      const current = new Date(cursor)
      const nextDay = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1).getTime()
      const chunk = Math.min(end, nextDay) - cursor
      const date = localDate(current.toISOString())
      a[date] = (a[date] || 0) + chunk / 60000
      cursor += chunk
    }
    return a
  }, {})

export const heatLevel = (minutes: number, goal: number) =>
  goal <= 0 ? 0 : minutes <= 0 ? 0 : minutes / goal <= 0.25 ? 1 : minutes / goal <= 0.5 ? 2 : minutes / goal <= 0.75 ? 3 : minutes / goal < 1 ? 4 : 5

export const recommendations = (profile: Profile, attempts: Attempt[], errors: ErrorRecord[], plan: PlanItem[]) => {
  if (!profile.targetBand && !profile.dailyGoalMinutes)
    return { title: 'Set up your learner profile', reason: 'A target and study goal are needed to make the plan meaningful.', page: 'profile' as const }
  if (!attempts.length)
    return { title: 'Take your first Reading practice', reason: 'There is no practice evidence yet. Start with the original passage to establish a baseline.', page: 'practice' as const }
  const open = errors.filter(isErrorOpen)
  if (open.length) {
    const objective = open[0].objective
    return { title: `Retest: ${objective}`, reason: 'This objective is still open in Error Memory; complete a new equivalent task.', page: 'errors' as const }
  }
  const latest = attempts[attempts.length - 1]
  if (latest && latest.total > 0 && latest.score / latest.total < 0.75)
    return { title: 'Repeat a focused Reading practice', reason: `Your latest practice was ${latest.score}/${latest.total}; reinforce the same skill with a new attempt.`, page: 'practice' as const }
  const pending = plan.find(p => p.status === 'planned')
  if (pending)
    return { title: pending.title, reason: pending.reason || 'This is the next planned activity.', page: 'plan' as const }
  return { title: 'Plan your next evidence check', reason: 'No open error or pending task is available; add a transparent activity to continue.', page: 'plan' as const }
}

export type CalendarDay = {
  date: string
  dayNumber: number
  isCurrentMonth: boolean
  isAdjacentMonth: boolean
  year: number
  month: number
}

export const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate()
}

export const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export const getMonthGrid = (year: number, month: number): CalendarDay[] => {
  const firstDayIndex = new Date(year, month - 1, 1).getDay()
  const daysInCurrentMonth = getDaysInMonth(year, month)

  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  const cells: CalendarDay[] = []

  // 1. Leading adjacent days from previous month to align first day with Sunday
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNumber = daysInPrevMonth - i
    const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    cells.push({
      date,
      dayNumber,
      isCurrentMonth: false,
      isAdjacentMonth: true,
      year: prevYear,
      month: prevMonth,
    })
  }

  // 2. Days of the current month
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      date,
      dayNumber: day,
      isCurrentMonth: true,
      isAdjacentMonth: false,
      year,
      month,
    })
  }

  // 3. Trailing adjacent days from next month to complete 6 full 7-day rows (42 cells)
  const remainingCells = 42 - cells.length
  for (let day = 1; day <= remainingCells; day++) {
    const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      date,
      dayNumber: day,
      isCurrentMonth: false,
      isAdjacentMonth: true,
      year: nextYear,
      month: nextMonth,
    })
  }

  return cells
}

export const formatSelectedDateHeader = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export const formatMonthHeading = (year: number, month: number): string => {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
