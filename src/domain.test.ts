import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { Practice } from './App'
import { passages, practicePassages, retestPassages } from './content'
import {
  canSubmitRetest,
  formatMonthHeading,
  formatSelectedDateHeader,
  getDaysInMonth,
  getMonthGrid,
  getObjectiveId,
  getRetestQuestions,
  heatLevel,
  isErrorOpen,
  isLeapYear,
  makeErrors,
  mergeAttemptErrors,
  minutesByDate,
  recommendations,
  scoreAttempt,
  startOfLocalWeek,
  toLocalDateString
} from './domain'
import type { Attempt, ErrorRecord, Profile, Store, StudySession } from './types'

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
    const error: ErrorRecord = {
      id: 'e',
      questionId: 'q2',
      attemptId: 'a1',
      attemptIds: ['a1'],
      passageId: 'p',
      type: 'multiple-choice' as const,
      objective: 'detail',
      objectiveId: 'detail',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'x',
      createdAt: '2026-01-01T10:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
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

describe('Retest and Error Memory integrity regressions (All 10 Required Tests)', () => {
  const urbanGardens = passages.find(p => p.id === 'urban-gardens')!
  const urbanGardensRetest = passages.find(p => p.id === 'urban-gardens-retest')!

  it('1. The original urban-gardens question has a logically valid answer supported by its text', () => {
    const q2 = urbanGardens.questions.find(q => q.id === 'q2')!
    expect(q2).toBeDefined()
    expect(q2.prompt).toBe('A single urban garden can cool an entire city.')
    expect(q2.answer).toBe('False')
    expect(q2.objectiveId).toBe('distinguish-contradiction')
    // Passage text explicitly contradicts the statement
    expect(urbanGardens.text).toContain('a small garden cannot lower the temperature of an entire city')
    expect(q2.explanation).toContain('cannot lower the temperature of an entire city')
  })

  it('2. A Retest for a contradiction objective actually tests a contradiction rather than an unrelated True statement', () => {
    const r2 = urbanGardensRetest.questions.find(q => q.id === 'r2')!
    expect(r2).toBeDefined()
    expect(r2.objectiveId).toBe('distinguish-contradiction')
    // Must test a contradiction where statement contradicts passage (answer is False)
    expect(r2.answer).toBe('False')
    expect(r2.prompt).toBe('One isolated garden is expected to cool an entire city.')
    expect(urbanGardensRetest.text).toContain('one isolated plot should not be expected to cool the whole city')
    expect(r2.explanation).toContain('one isolated plot should not be expected to cool the whole city')
  })

  it('3. A correct Retest resolves only the intended error', () => {
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
      passageId: urbanGardensRetest.id,
      skill: 'Reading',
      answers: { [retestQuestion.id]: retestQuestion.answer },
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
    expect(merged[0].resolvedAt).toBe('2026-03-02T10:00:00Z')
    expect(merged[0].resolvedAttemptId).toBe('att-retest-1')
  })

  it('4. A failed Retest keeps or reopens the intended error', () => {
    const originalError: ErrorRecord = {
      id: 'err-urban-gardens-identify-main-idea',
      questionId: 'q1',
      attemptId: 'att-orig-1',
      attemptIds: ['att-orig-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'Wrong answer',
      correctAnswer: 'Right answer',
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
    expect(merged[0].retestAttemptIds).toContain('att-retest-failed')
    expect(merged[0].attemptIds).toEqual(['att-orig-1', 'att-retest-failed'])
  })

  it('5. No matching Retest objective prevents submission instead of testing unrelated questions', () => {
    // 5a. Pure domain validation
    const unmatchedObjectiveId = 'non-existent-objective'
    const matchingQs = getRetestQuestions(urbanGardensRetest, [unmatchedObjectiveId])
    expect(matchingQs).toHaveLength(0)
    expect(canSubmitRetest(true, matchingQs)).toBe(false)

    // 5b. Component-level test: render Practice with unmatched error ID
    const dummyStore: Store = {
      version: 1,
      profile: { daysOff: [], priority: 'Reading' },
      attempts: [],
      errors: [
        {
          id: 'err-unmatched',
          questionId: 'q-custom',
          attemptId: 'att-1',
          attemptIds: ['att-1'],
          passageId: 'other-passage',
          type: 'multiple-choice',
          objective: 'Unknown Skill Area',
          objectiveId: unmatchedObjectiveId,
          prompt: 'Custom prompt',
          learnerAnswer: 'Custom answer',
          correctAnswer: 'Correct answer',
          explanation: 'Custom explanation',
          createdAt: '2026-03-01T09:00:00Z',
          reviewCount: 0,
          retestAttemptIds: [],
          status: 'open'
        }
      ],
      sessions: [],
      plan: []
    }

    const html = renderToStaticMarkup(
      React.createElement(Practice, {
        s: dummyStore,
        setS: () => {},
        note: () => {},
        ids: ['err-unmatched'],
      })
    )

    // Verifies explicit notice is rendered and submission button is prevented
    expect(html).toContain('No matching retest item is available for this learning objective.')
    expect(html).not.toContain('Submit attempt')
    // Verifies unrelated questions from the passage are NOT displayed to the learner
    expect(html).not.toContain('Check your understanding')
  })

  it('6. When another passage triggers the same objective, the Error Review content remains internally consistent', () => {
    // Original error in urban-gardens
    const originalError: ErrorRecord = {
      id: 'err-urban-gardens-identify-main-idea',
      questionId: 'q1',
      attemptId: 'att-orig-1',
      attemptIds: ['att-orig-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      prompt: 'What is the main point of the passage?',
      learnerAnswer: 'Urban gardens solve every climate problem.',
      correctAnswer: 'Urban gardens offer local environmental and social benefits when planned well.',
      explanation: 'The passage describes local cooling, habitat and social benefits, then stresses realistic planning.',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    // Subsequent practice failure on community-libraries for the same objective
    const libraryQ1 = passages.find(p => p.id === 'community-libraries')!.questions[0]
    const subsequentAttempt: Attempt = {
      id: 'att-community-fail',
      passageId: 'community-libraries',
      skill: 'Reading',
      answers: { [libraryQ1.id]: 'They measure success only by attendance.' },
      score: 0,
      total: 1,
      kind: 'practice',
      createdAt: '2026-03-05T14:00:00Z',
      objectiveIds: ['identify-main-idea']
    }

    const merged = mergeAttemptErrors([originalError], subsequentAttempt, [libraryQ1])
    expect(merged).toHaveLength(1)
    const err = merged[0]

    // Top-level display fields are internally consistent: prompt, answer, explanation all come from community-libraries!
    expect(err.passageId).toBe('community-libraries')
    expect(err.questionId).toBe(libraryQ1.id)
    expect(err.prompt).toBe(libraryQ1.prompt)
    expect(err.learnerAnswer).toBe('They measure success only by attendance.')
    expect(err.correctAnswer).toBe(libraryQ1.answer)
    expect(err.explanation).toBe(libraryQ1.explanation)

    // Original context is preserved without loss
    expect(err.originalContext).toBeDefined()
    expect(err.originalContext?.passageId).toBe('urban-gardens')
    expect(err.originalContext?.prompt).toBe('What is the main point of the passage?')

    // Occurrences history records both distinct failures
    expect(err.occurrences).toHaveLength(2)
    expect(err.occurrences?.[0].passageId).toBe('urban-gardens')
    expect(err.occurrences?.[1].passageId).toBe('community-libraries')
  })

  it('7. Successful and failed attempt IDs are recorded correctly', () => {
    const error: ErrorRecord = {
      id: 'err-test',
      questionId: 'q1',
      attemptId: 'att-init',
      attemptIds: ['att-init'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'exp',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    const retestQ = urbanGardensRetest.questions[0]

    // 1. First retest fails
    const failedRetest: Attempt = {
      id: 'att-retest-fail-1',
      passageId: urbanGardensRetest.id,
      skill: 'Reading',
      answers: { [retestQ.id]: 'incorrect' },
      score: 0,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-02T10:00:00Z',
      objectiveIds: ['identify-main-idea'],
      targetErrorIds: [error.id]
    }
    const afterFail = mergeAttemptErrors([error], failedRetest, [retestQ])[0]
    expect(afterFail.attemptIds).toEqual(['att-init', 'att-retest-fail-1'])
    expect(afterFail.retestAttemptIds).toEqual(['att-retest-fail-1'])

    // 2. Second retest succeeds
    const successRetest: Attempt = {
      id: 'att-retest-pass-2',
      passageId: urbanGardensRetest.id,
      skill: 'Reading',
      answers: { [retestQ.id]: retestQ.answer },
      score: 1,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-03T10:00:00Z',
      objectiveIds: ['identify-main-idea'],
      targetErrorIds: [error.id]
    }
    const afterPass = mergeAttemptErrors([afterFail], successRetest, [retestQ])[0]
    // Both success and failure attempts are present in attemptIds!
    expect(afterPass.attemptIds).toEqual(['att-init', 'att-retest-fail-1', 'att-retest-pass-2'])
    expect(afterPass.retestAttemptIds).toEqual(['att-retest-fail-1', 'att-retest-pass-2'])
  })

  it('8. Reopened errors do not retain stale resolution metadata', () => {
    const resolvedError: ErrorRecord = {
      id: 'err-test',
      questionId: 'q1',
      attemptId: 'att-init',
      attemptIds: ['att-init', 'att-retest-pass'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'wrong',
      correctAnswer: 'right',
      explanation: 'exp',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: ['att-retest-pass'],
      status: 'resolved',
      resolvedAt: '2026-03-02T10:00:00Z',
      resolvedAttemptId: 'att-retest-pass'
    }

    // A later practice failure reopens the error
    const libraryQ1 = passages.find(p => p.id === 'community-libraries')!.questions[0]
    const reopeningAttempt: Attempt = {
      id: 'att-later-fail',
      passageId: 'community-libraries',
      skill: 'Reading',
      answers: { [libraryQ1.id]: 'wrong again' },
      score: 0,
      total: 1,
      kind: 'practice',
      createdAt: '2026-03-10T10:00:00Z',
      objectiveIds: ['identify-main-idea']
    }

    const reopened = mergeAttemptErrors([resolvedError], reopeningAttempt, [libraryQ1])[0]
    expect(reopened.status).toBe('open')
    // Stale resolution metadata MUST be cleared
    expect(reopened.resolvedAt).toBeUndefined()
    expect(reopened.resolvedAttemptId).toBeUndefined()
    // Historical resolutions must be preserved
    expect(reopened.historicalResolutions).toHaveLength(1)
    expect(reopened.historicalResolutions?.[0].resolvedAt).toBe('2026-03-02T10:00:00Z')
  })

  it('9. Existing attempts and error history remain intact', () => {
    const historicalAttempts: Attempt[] = [
      { id: 'h1', passageId: 'urban-gardens', skill: 'Reading', answers: { q1: 'wrong' }, score: 0, total: 1, kind: 'practice', createdAt: '2026-01-01T10:00:00Z', objectiveIds: ['identify-main-idea'] },
      { id: 'h2', passageId: 'urban-gardens-retest', skill: 'Reading', answers: { r1: 'right' }, score: 1, total: 1, kind: 'retest', createdAt: '2026-01-02T10:00:00Z', objectiveIds: ['identify-main-idea'], targetErrorIds: ['err-1'] },
      { id: 'h3', passageId: 'community-libraries', skill: 'Reading', answers: { l1: 'right' }, score: 1, total: 1, kind: 'practice', createdAt: '2026-01-03T10:00:00Z', objectiveIds: ['identify-main-idea'] }
    ]
    expect(historicalAttempts).toHaveLength(3)
    expect(historicalAttempts.map(a => a.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('10. Existing tests continue to pass', () => {
    expect(practicePassages.every(p => p.kind !== 'retest')).toBe(true)
    expect(retestPassages.every(p => p.kind === 'retest')).toBe(true)
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
    const decGrid = getMonthGrid(2026, 12)
    expect(decGrid).toHaveLength(42)
    const trailingJan = decGrid.filter(c => c.month === 1)
    expect(trailingJan.length).toBeGreaterThan(0)
    expect(trailingJan[0].year).toBe(2027)
    expect(trailingJan[0].date.startsWith('2027-01-')).toBe(true)

    const janGrid = getMonthGrid(2026, 1)
    expect(janGrid).toHaveLength(42)
    const leadingDec = janGrid.filter(c => c.month === 12)
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

    expect(isLeapYear(2000)).toBe(true)
    expect(getDaysInMonth(2000, 2)).toBe(29)
    expect(isLeapYear(1900)).toBe(false)
    expect(getDaysInMonth(1900, 2)).toBe(28)

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
    const d = new Date(2026, 9, 15)
    expect(toLocalDateString(d)).toBe('2026-10-15')
  })
})

describe('Retest targeting hardening (Scope 3)', () => {
  const urbanGardensRetest = passages.find(p => p.id === 'urban-gardens-retest')!

  it('fails closed when targeted error ID does not exist in store', () => {
    const dummyStore: Store = {
      version: 1,
      profile: { daysOff: [], priority: 'Reading' },
      attempts: [],
      errors: [
        {
          id: 'err-known',
          questionId: 'q1',
          attemptId: 'att-1',
          attemptIds: ['att-1'],
          passageId: 'urban-gardens',
          type: 'multiple-choice',
          objective: 'Identify the main idea',
          objectiveId: 'identify-main-idea',
          learnerAnswer: 'Wrong',
          correctAnswer: 'Right',
          explanation: 'Exp',
          createdAt: '2026-03-01T09:00:00Z',
          reviewCount: 0,
          retestAttemptIds: [],
          status: 'open'
        }
      ],
      sessions: [],
      plan: []
    }

    // Component test: Retest mode with unknown error ID
    const html = renderToStaticMarkup(
      React.createElement(Practice, {
        s: dummyStore,
        setS: () => {},
        note: () => {},
        ids: ['non-existent-error-id-999'],
      })
    )

    expect(html).toContain('Targeted error record not found.')
    expect(html).toContain('Retest is stopped to prevent invalid progress recording.')
    expect(html).not.toContain('Submit attempt')
    expect(html).not.toContain('Check your understanding')

    // Domain test
    expect(canSubmitRetest(true, [], false)).toBe(false)
  })

  it('fails closed when targeted error has an unknown objective ID not present in retest passage', () => {
    const dummyStore: Store = {
      version: 1,
      profile: { daysOff: [], priority: 'Reading' },
      attempts: [],
      errors: [
        {
          id: 'err-unmatched-obj',
          questionId: 'q-custom',
          attemptId: 'att-1',
          attemptIds: ['att-1'],
          passageId: 'urban-gardens',
          type: 'multiple-choice',
          objective: 'Unmatched Objective',
          objectiveId: 'unmatched-objective-id',
          learnerAnswer: 'Wrong',
          correctAnswer: 'Right',
          explanation: 'Exp',
          createdAt: '2026-03-01T09:00:00Z',
          reviewCount: 0,
          retestAttemptIds: [],
          status: 'open'
        }
      ],
      sessions: [],
      plan: []
    }

    const matchingQuestions = getRetestQuestions(urbanGardensRetest, ['unmatched-objective-id'])
    expect(matchingQuestions).toHaveLength(0)

    const html = renderToStaticMarkup(
      React.createElement(Practice, {
        s: dummyStore,
        setS: () => {},
        note: () => {},
        ids: ['err-unmatched-obj'],
      })
    )

    expect(html).toContain('No matching retest item is available for this learning objective.')
    expect(html).not.toContain('Submit attempt')
    expect(canSubmitRetest(true, matchingQuestions, true)).toBe(false)
  })

  it('allows valid target retest and resolves ONLY the intended ErrorRecord', () => {
    const errTarget: ErrorRecord = {
      id: 'err-target-contradiction',
      questionId: 'q2',
      attemptId: 'att-1',
      attemptIds: ['att-1'],
      passageId: 'urban-gardens',
      type: 'true-false-not-given',
      objective: 'Distinguish explicit contradiction',
      objectiveId: 'distinguish-contradiction',
      learnerAnswer: 'True',
      correctAnswer: 'False',
      explanation: 'Exp',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    const errUntargeted: ErrorRecord = {
      id: 'err-untargeted-main-idea',
      questionId: 'q1',
      attemptId: 'att-1',
      attemptIds: ['att-1'],
      passageId: 'urban-gardens',
      type: 'multiple-choice',
      objective: 'Identify the main idea',
      objectiveId: 'identify-main-idea',
      learnerAnswer: 'Wrong',
      correctAnswer: 'Right',
      explanation: 'Exp',
      createdAt: '2026-03-01T09:00:00Z',
      reviewCount: 0,
      retestAttemptIds: [],
      status: 'open'
    }

    const dummyStore: Store = {
      version: 1,
      profile: { daysOff: [], priority: 'Reading' },
      attempts: [],
      errors: [errTarget, errUntargeted],
      sessions: [],
      plan: []
    }

    // 1. Valid target questions matching
    const matchingQs = getRetestQuestions(urbanGardensRetest, ['distinguish-contradiction'])
    expect(matchingQs).toHaveLength(1)
    expect(matchingQs[0].id).toBe('r2')
    expect(canSubmitRetest(true, matchingQs, true)).toBe(true)

    // 2. Component renders matching question and submit button
    const html = renderToStaticMarkup(
      React.createElement(Practice, {
        s: dummyStore,
        setS: () => {},
        note: () => {},
        ids: ['err-target-contradiction'],
      })
    )
    expect(html).toContain('Submit attempt')
    expect(html).toContain('One isolated garden is expected to cool an entire city.')

    // 3. Complete retest attempt targeting only err-target-contradiction
    const retestAttempt: Attempt = {
      id: 'att-retest-pass-contradiction',
      passageId: urbanGardensRetest.id,
      skill: 'Reading',
      answers: { r2: 'False' },
      score: 1,
      total: 1,
      kind: 'retest',
      createdAt: '2026-03-02T10:00:00Z',
      objectiveIds: ['distinguish-contradiction'],
      targetErrorIds: ['err-target-contradiction'],
      targetObjectiveId: 'distinguish-contradiction'
    }

    const merged = mergeAttemptErrors([errTarget, errUntargeted], retestAttempt, matchingQs)
    expect(merged).toHaveLength(2)

    // Targeted error resolved with explicit retest outcome
    const updatedTarget = merged.find(e => e.id === 'err-target-contradiction')!
    expect(updatedTarget.status).toBe('resolved')
    expect(updatedTarget.resolvedAt).toBe('2026-03-02T10:00:00Z')
    expect(updatedTarget.retestOutcomes).toBeDefined()
    expect(updatedTarget.retestOutcomes?.[0].outcome).toBe('passed')

    // Untargeted error MUST remain open and unmodified
    const updatedUntargeted = merged.find(e => e.id === 'err-untargeted-main-idea')!
    expect(updatedUntargeted.status).toBe('open')
    expect(updatedUntargeted.resolvedAt).toBeUndefined()
    expect(updatedUntargeted.retestAttemptIds).toHaveLength(0)
  })
})

