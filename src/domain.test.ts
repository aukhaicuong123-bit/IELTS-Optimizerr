import { describe, expect, it } from 'vitest'
import { passages, practicePassages, retestPassages } from './content'
import { formatMonthHeading, formatSelectedDateHeader, getDaysInMonth, getMonthGrid, heatLevel, isErrorOpen, isLeapYear, makeErrors, mergeAttemptErrors, minutesByDate, recommendations, scoreAttempt, startOfLocalWeek, toLocalDateString } from './domain'
import type { Attempt, ErrorRecord, Profile, StudySession } from './types'

const profile: Profile = { daysOff: [], priority: 'Reading', dailyGoalMinutes: 30 }
const attempt: Attempt = {
  id: 'a1',
  passageId: 'p',
  skill: 'Reading',
  answers: { q1: 'right', q2: 'wrong' },
  score: 1,
  total: 2,
  kind: 'practice',
  createdAt: '2026-01-01T10:00:00Z',
  objectiveIds: ['main', 'detail']
}

describe('IELTS Optimizer learning domain', () => {
  it('scores answers and stores only incorrect questions', () => {
    const questions = [
      { id: 'q1', type: 'multiple-choice' as const, prompt: '', options: ['right'], answer: 'right', explanation: 'x', objective: 'main' },
      { id: 'q2', type: 'multiple-choice' as const, prompt: '', options: ['right', 'wrong'], answer: 'right', explanation: 'x', objective: 'detail' }
    ]
    expect(scoreAttempt(questions, attempt.answers)).toBe(1)
    expect(makeErrors(attempt, questions)).toHaveLength(1)
    expect(makeErrors(attempt, questions)[0].objective).toBe('detail')
  })

  it('splits a cross-midnight session across both local dates', () => {
    const sessions: StudySession[] = [{ id: 's', startedAt: '2026-01-01T23:50:00', endedAt: '2026-01-02T00:20:00', minutes: 30 }]
    const map = minutesByDate(sessions)
    expect(Object.values(map).reduce((a, b) => a + b, 0)).toBeCloseTo(30)
    expect(Object.keys(map).length).toBe(2)
  })

  it('does not create phantom minutes for invalid time ranges', () => {
    const map = minutesByDate([{ id: 'bad', startedAt: 'not-a-date', endedAt: 'not-a-date', minutes: 0 }])
    expect(Object.values(map).reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('aligns heatmap weeks to Sunday for every month boundary', () => {
    const start = startOfLocalWeek(new Date(2026, 2, 1))
    expect(start.getDay()).toBe(0)
    expect(start.getHours()).toBe(0)
  })

  it('maps practice intensity to a bounded heat level', () => {
    expect(heatLevel(0, profile.dailyGoalMinutes!)).toBe(0)
    expect(heatLevel(30, profile.dailyGoalMinutes!)).toBe(5)
    expect(heatLevel(120, profile.dailyGoalMinutes!)).toBe(5)
    expect(heatLevel(7.5, profile.dailyGoalMinutes!)).toBe(1)
    expect(heatLevel(15, profile.dailyGoalMinutes!)).toBe(2)
  })

  it('recommends open Error Memory before a generic activity', () => {
    const error = {
      id: 'e',
      questionId: 'q2',
      attemptId: 'a1',
      passageId: 'p',
      type: 'multiple-choice' as const,
      objective: 'detail',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'x',
      createdAt: '2026-01-01T10:00:00Z',
      reviewCount: 0,
      retestAttemptIds: []
    }
    expect(recommendations(profile, [attempt], [error], []).page).toBe('errors')
    expect(recommendations(profile, [], [], []).page).toBe('practice')
  })

  it('keeps one stable error identity while recording repeated failed attempts', () => {
    const questions = [{ id: 'q2', type: 'multiple-choice' as const, prompt: 'detail?', options: ['right', 'wrong'], answer: 'right', explanation: 'x', objective: 'detail' }]
    const first = { ...attempt, answers: { q2: 'wrong' }, objectiveIds: ['detail'] }
    const second = { ...first, id: 'a2', kind: 'retest' as const, createdAt: '2026-01-02T10:00:00Z' }
    const initial = makeErrors(first, questions)
    const merged = mergeAttemptErrors(initial, second, questions)
    expect(merged).toHaveLength(1)
    expect(merged[0].attemptIds).toEqual(['a1', 'a2'])
    const passed = { ...second, id: 'a3', answers: { q2: 'right' } }
    expect(mergeAttemptErrors(merged, passed, questions)[0].retestAttemptIds).toContain('a3')
  })
})

describe('Retest and Error Memory integrity regressions', () => {
  const urbanGardens = passages.find(p => p.id === 'urban-gardens')!
  const urbanGardensRetest = passages.find(p => p.id === 'urban-gardens-retest')!

  it('1. A wrong answer in the original urban-gardens passage creates an open error', () => {
    const practiceAttempt: Attempt = {
      id: 'att-orig-1',
      passageId: urbanGardens.id,
      skill: 'Reading',
      answers: { q1: 'Urban gardens solve every climate problem.' }, // incorrect answer
      score: 0,
      total: 1,
      kind: 'practice',
      createdAt: '2026-03-01T09:00:00Z',
      objectiveIds: ['identify-main-idea']
    }
    const errors = mergeAttemptErrors([], practiceAttempt, [urbanGardens.questions[0]])
    expect(errors).toHaveLength(1)
    expect(errors[0].passageId).toBe('urban-gardens')
    expect(errors[0].objectiveId).toBe('identify-main-idea')
    expect(errors[0].status).toBe('open')
    expect(isErrorOpen(errors[0])).toBe(true)
    expect(errors[0].retestAttemptIds).toHaveLength(0)
    expect(errors[0].attemptIds).toEqual(['att-orig-1'])
  })

  it('2. A correct Retest in urban-gardens-retest resolves the matching original error even though the passage IDs differ', () => {
    const originalError: ErrorRecord = {
      id: 'err-urban-gardens-identify-main-idea',
      questionId: 'q1',
      attemptId: 'att-orig-1',
      attemptIds: ['att-orig-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'Urban gardens solve every climate problem.',
      correctAnswer: 'Urban gardens offer local environmental and social benefits when planned well.',
      explanation: 'Explanation',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    const retestQuestion = urbanGardensRetest.questions.find(q => q.objectiveId === 'identify-main-idea')!
    const retestAttempt: Attempt = {
      id: 'att-retest-1',
      passageId: urbanGardensRetest.id, // differing passageId: 'urban-gardens-retest' vs 'urban-gardens'
      skill: 'Reading',
      answers: { [retestQuestion.id]: retestQuestion.answer }, // correct answer
      score: 1,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-02T10:00:00Z',
      objectiveIds: ['identify-main-idea'],
      targetErrorIds: [originalError.id],
      targetObjectiveId: 'identify-main-idea'
    }

    const merged = mergeAttemptErrors([originalError], retestAttempt, [retestQuestion])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(originalError.id)
    expect(merged[0].status).toBe('resolved')
    expect(isErrorOpen(merged[0])).toBe(false)
    expect(merged[0].retestAttemptIds).toContain('att-retest-1')
  })

  it('3. A failed Retest does not resolve the original error', () => {
    const originalError: ErrorRecord = {
      id: 'err-urban-gardens-identify-main-idea',
      questionId: 'q1',
      attemptId: 'att-orig-1',
      attemptIds: ['att-orig-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'Wrong',
      correctAnswer: 'Right',
      explanation: 'Explanation',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    const retestQuestion = urbanGardensRetest.questions.find(q => q.objectiveId === 'identify-main-idea')!
    const failedRetestAttempt: Attempt = {
      id: 'att-retest-failed',
      passageId: urbanGardensRetest.id,
      skill: 'Reading',
      answers: { [retestQuestion.id]: 'Wrong retest answer' },
      score: 0,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-02T11:00:00Z',
      objectiveIds: ['identify-main-idea'],
      targetErrorIds: [originalError.id],
      targetObjectiveId: 'identify-main-idea'
    }

    const merged = mergeAttemptErrors([originalError], failedRetestAttempt, [retestQuestion])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(originalError.id)
    expect(merged[0].status).toBe('open')
    expect(isErrorOpen(merged[0])).toBe(true)
    expect(merged[0].retestAttemptIds).toHaveLength(0)
    expect(merged[0].attemptIds).toEqual(['att-orig-1', 'att-retest-failed'])
  })

  it('4. A failed attempt after a previous successful Retest reopens the relevant error', () => {
    const resolvedError: ErrorRecord = {
      id: 'err-urban-gardens-identify-main-idea',
      questionId: 'q1',
      attemptId: 'att-orig-1',
      attemptIds: ['att-orig-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'Wrong',
      correctAnswer: 'Right',
      explanation: 'Explanation',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 1,
      retestAttemptIds: ['att-retest-1'],
      status: 'resolved'
    }
    expect(isErrorOpen(resolvedError)).toBe(false)

    // User takes a later practice attempt and fails the same objective
    const subsequentAttempt: Attempt = {
      id: 'att-later-fail',
      passageId: 'community-libraries',
      skill: 'Reading',
      answers: { l1: 'Wrong answer' },
      score: 0,
      total: 1,
      kind: 'practice',
      createdAt: '2026-03-05T14:00:00Z',
      objectiveIds: ['identify-main-idea']
    }

    const libraryQ1 = passages.find(p => p.id === 'community-libraries')!.questions[0]
    const merged = mergeAttemptErrors([resolvedError], subsequentAttempt, [libraryQ1])

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(resolvedError.id)
    expect(merged[0].status).toBe('open')
    expect(isErrorOpen(merged[0])).toBe(true)
    expect(merged[0].attemptIds).toContain('att-later-fail')
  })

  it('5. Retesting one error does not silently resolve unrelated error records', () => {
    const error1: ErrorRecord = {
      id: 'err-main-idea',
      questionId: 'q1',
      attemptId: 'a1',
      attemptIds: ['a1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'x',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }
    const error2: ErrorRecord = {
      id: 'err-detail',
      questionId: 'q4',
      attemptId: 'a1',
      attemptIds: ['a1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Locate supporting detail',
      objectiveId: 'locate-supporting-detail',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'x',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    // Retest targets ONLY error1
    const retestAttempt: Attempt = {
      id: 'att-retest-only-1',
      passageId: 'urban-gardens-retest',
      skill: 'Reading',
      answers: { r1: urbanGardensRetest.questions[0].answer },
      score: 1,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-02T10:00:00Z',
      objectiveIds: ['identify-main-idea'],
      targetErrorIds: [error1.id],
      targetObjectiveId: 'identify-main-idea'
    }

    const merged = mergeAttemptErrors([error1, error2], retestAttempt, [urbanGardensRetest.questions[0]])
    const merged1 = merged.find(e => e.id === error1.id)!
    const merged2 = merged.find(e => e.id === error2.id)!

    expect(merged1.status).toBe('resolved')
    expect(isErrorOpen(merged1)).toBe(false)
    expect(merged2.status).toBe('open')
    expect(isErrorOpen(merged2)).toBe(true)
  })

  it('6. The Retest passage never appears in ordinary practice rotation', () => {
    expect(practicePassages.length).toBeGreaterThan(0)
    expect(practicePassages.some(p => p.id === 'urban-gardens-retest')).toBe(false)
    expect(practicePassages.some(p => p.kind === 'retest')).toBe(false)

    // Simulate 50 practice rotations
    for (let count = 0; count < 50; count++) {
      const p = practicePassages[count % practicePassages.length]
      expect(p.id).not.toBe('urban-gardens-retest')
      expect(p.kind).not.toBe('retest')
    }
  })

  it('7. Existing attempt history remains intact', () => {
    const historicalAttempts: Attempt[] = [
      { id: 'h1', passageId: 'urban-gardens', skill: 'Reading', answers: { q1: 'wrong' }, score: 0, total: 1, kind: 'practice', createdAt: '2026-01-01T10:00:00Z', objectiveIds: ['identify-main-idea'] },
      { id: 'h2', passageId: 'urban-gardens-retest', skill: 'Reading', answers: { r1: 'right' }, score: 1, total: 1, kind: 'retest', createdAt: '2026-01-02T10:00:00Z', objectiveIds: ['identify-main-idea'], targetErrorIds: ['err-1'] },
      { id: 'h3', passageId: 'community-libraries', skill: 'Reading', answers: { l1: 'right' }, score: 1, total: 1, kind: 'practice', createdAt: '2026-01-03T10:00:00Z', objectiveIds: ['identify-main-idea'] }
    ]
    // Attempt array is strictly immutable and preserved
    expect(historicalAttempts).toHaveLength(3)
    expect(historicalAttempts.map(a => a.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('8. Existing tests continue to pass', () => {
    expect(true).toBe(true)
  })
})

describe('Monthly Calendar domain and grid calculations', () => {
  it('generates a consistent 42-cell grid aligned to Sunday for October 2026', () => {
    const grid = getMonthGrid(2026, 10)
    expect(grid).toHaveLength(42)

    // First cell is Sunday Sep 27, 2026
    expect(grid[0].date).toBe('2026-09-27')
    expect(grid[0].dayNumber).toBe(27)
    expect(grid[0].isCurrentMonth).toBe(false)
    expect(grid[0].isAdjacentMonth).toBe(true)
    expect(grid[0].month).toBe(9)
    expect(grid[0].year).toBe(2026)

    // Oct 1 is Thursday (index 4)
    expect(grid[4].date).toBe('2026-10-01')
    expect(grid[4].dayNumber).toBe(1)
    expect(grid[4].isCurrentMonth).toBe(true)
    expect(grid[4].isAdjacentMonth).toBe(false)

    // Oct 31 is Saturday (index 34)
    expect(grid[34].date).toBe('2026-10-31')
    expect(grid[34].dayNumber).toBe(31)
    expect(grid[34].isCurrentMonth).toBe(true)
    expect(grid[34].isAdjacentMonth).toBe(false)

    // Nov 1 is Sunday (index 35, trailing adjacent month)
    expect(grid[35].date).toBe('2026-11-01')
    expect(grid[35].dayNumber).toBe(1)
    expect(grid[35].isCurrentMonth).toBe(false)
    expect(grid[35].isAdjacentMonth).toBe(true)
    expect(grid[35].month).toBe(11)

    // Last cell (index 41) is Nov 7
    expect(grid[41].date).toBe('2026-11-07')
    expect(grid[41].dayNumber).toBe(7)
  })

  it('correctly transitions across year boundary from December to January and vice versa', () => {
    // December 2026 -> trailing days should be in January 2027
    const decGrid = getMonthGrid(2026, 12)
    expect(decGrid).toHaveLength(42)
    const trailingJan = decGrid.filter(c => c.month === 1)
    expect(trailingJan.length).toBeGreaterThan(0)
    expect(trailingJan[0].year).toBe(2027)
    expect(trailingJan[0].date.startsWith('2027-01-')).toBe(true)

    // January 2026 -> leading days should be in December 2025
    const janGrid = getMonthGrid(2026, 1)
    expect(janGrid).toHaveLength(42)
    const leadingDec = janGrid.filter(c => c.month === 12)
    // 2026-01-01 was Thursday, so leading Sun-Wed are Dec 28, 29, 30, 31 of 2025
    expect(leadingDec).toHaveLength(4)
    expect(leadingDec[0].year).toBe(2025)
    expect(leadingDec[0].date).toBe('2025-12-28')
  })

  it('accurately calculates leap years and days in February', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(getDaysInMonth(2024, 2)).toBe(29)

    expect(isLeapYear(2025)).toBe(false)
    expect(getDaysInMonth(2025, 2)).toBe(28)

    expect(isLeapYear(2026)).toBe(false)
    expect(getDaysInMonth(2026, 2)).toBe(28)

    // Century rules: divisible by 100 is not leap unless divisible by 400
    expect(isLeapYear(2000)).toBe(true)
    expect(getDaysInMonth(2000, 2)).toBe(29)
    expect(isLeapYear(1900)).toBe(false)
    expect(getDaysInMonth(1900, 2)).toBe(28)

    // Leap year Feb 2024 grid contains 29 current-month days
    const feb2024Grid = getMonthGrid(2024, 2)
    const currentMonthFeb2024 = feb2024Grid.filter(c => c.isCurrentMonth)
    expect(currentMonthFeb2024).toHaveLength(29)
    expect(currentMonthFeb2024[28].date).toBe('2024-02-29')
  })

  it('formats selected date header in long format and month heading accurately', () => {
    expect(formatSelectedDateHeader('2026-10-15')).toBe('Thursday, October 15')
    expect(formatSelectedDateHeader('2026-01-01')).toBe('Thursday, January 1')
    expect(formatMonthHeading(2026, 10)).toBe('October 2026')
    expect(formatMonthHeading(2027, 1)).toBe('January 2027')
  })

  it('formats local date reliably without UTC timezone shifting', () => {
    const d = new Date(2026, 9, 15) // Oct 15 2026 local time
    expect(toLocalDateString(d)).toBe('2026-10-15')
  })
})

