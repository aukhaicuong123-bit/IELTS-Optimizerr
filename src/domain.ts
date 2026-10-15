import type { Attempt, ErrorRecord, PlanItem, Profile, Question, StudySession } from './types'

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

export const scoreAttempt = (questions: Question[], answers: Record<string, string>) =>
  questions.reduce((n, q) => n + (answers[q.id] === q.answer ? 1 : 0), 0)

export const makeErrors = (attempt: Attempt, questions: Question[]): ErrorRecord[] =>
  questions
    .filter(q => attempt.answers[q.id] !== q.answer)
    .map(q => {
      const objId = getObjectiveId(q)
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
        learnerAnswer: attempt.answers[q.id] || 'No answer',
        correctAnswer: q.answer,
        explanation: q.explanation,
        createdAt: attempt.createdAt,
        reviewCount: 0,
        retestAttemptIds: [],
        status: 'open' as const,
      }
    })

export const mergeAttemptErrors = (
  existing: ErrorRecord[],
  attempt: Attempt,
  questions: Question[]
): ErrorRecord[] => {
  const result: ErrorRecord[] = existing.map(e => ({
    ...e,
    objectiveId: e.objectiveId || getObjectiveId(e),
    attemptIds: [...(e.attemptIds || [e.attemptId])],
    retestAttemptIds: [...(e.retestAttemptIds || [])],
    status: e.status ? e.status : (e.retestAttemptIds && e.retestAttemptIds.length ? 'resolved' : 'open'),
  }))

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
        // Fallback for calls without explicit targetErrorIds (e.g. legacy tests)
        matchedError = result.find(e => getObjectiveId(e) === qObjId)
      }

      if (matchedError) {
        if (isCorrect) {
          matchedError.status = 'resolved'
          matchedError.resolvedAt = attempt.createdAt
          if (!matchedError.retestAttemptIds.includes(attempt.id)) {
            matchedError.retestAttemptIds.push(attempt.id)
          }
        } else {
          // Failed retest keeps error open or reopens it
          matchedError.status = 'open'
          matchedError.attemptId = attempt.id
          if (!matchedError.attemptIds?.includes(attempt.id)) {
            matchedError.attemptIds = [...(matchedError.attemptIds || []), attempt.id]
          }
          matchedError.learnerAnswer = attempt.answers[q.id] || 'No answer'
          matchedError.createdAt = attempt.createdAt
        }
      }
      // If no matched error was targeted for this question during a retest, do not create duplicate or unrelated records
    } else {
      // Ordinary practice attempt
      const old = result.find(e => getObjectiveId(e) === qObjId)
      if (!isCorrect) {
        if (old) {
          // Reopen or keep open, record the new attempt
          old.status = 'open'
          old.attemptId = attempt.id
          if (!old.attemptIds?.includes(attempt.id)) {
            old.attemptIds = [...(old.attemptIds || []), attempt.id]
          }
          old.learnerAnswer = attempt.answers[q.id] || 'No answer'
          old.createdAt = attempt.createdAt
        } else {
          const newErrors = makeErrors(attempt, [q])
          if (newErrors[0]) {
            result.push(newErrors[0])
          }
        }
      }
      // If correct in ordinary practice, do not silently resolve open error memory (retest is required)
    }
  }

  return result
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
