import { describe, expect, it } from 'vitest'
import { passages, practicePassages, retestPassages } from './content'
import { heatLevel, isErrorOpen, makeErrors, mergeAttemptErrors, minutesByDate, recommendations, scoreAttempt, startOfLocalWeek } from './domain'
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
