import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Home, ListChecks, Network, Palette, RotateCcw, Settings, Target } from 'lucide-react'
import { passages, practicePassages, retestPassages } from './content'
import { canSubmitRetest, formatMonthHeading, formatSelectedDateHeader, getMonthGrid, getObjectiveId, getRetestQuestions, heatLevel, isErrorOpen, localDate, mergeAttemptErrors, minutesByDate, recommendations, scoreAttempt, startOfLocalWeek, toLocalDateString, type CalendarDay } from './domain'
import { clearStore, loadStore } from './storage'
import type { Attempt, Page, PlanItem, Profile, Question, Store } from './types'

const nav: [Page, string, typeof Home][] = [
  ['dashboard', 'Dashboard', Home],
  ['plan', 'Study Plan', CalendarDays],
  ['practice', 'Reading Practice', BookOpen],
  ['errors', 'Error Review', RotateCcw],
  ['record', 'Learning Record', ListChecks],
  ['network', 'Learning Network', Network],
  ['design', 'Learning Design', Palette],
  ['profile', 'Profile', Settings]
]
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export default function App() {
  const [s, setS] = useState<Store>(loadStore),
    [page, setPage] = useState<Page>('dashboard'),
    [ids, setIds] = useState<string[]>([]),
    [toast, setToast] = useState('')

  useEffect(() => localStorage.setItem('ielts-optimizer-store-v1', JSON.stringify(s)), [s])

  const note = (x: string) => {
    setToast(x)
    setTimeout(() => setToast(''), 2400)
  }
  const go = (p: Page) => {
    setIds([])
    setPage(p)
  }
  const retest = (x: string[]) => {
    setIds(x)
    setPage('practice')
  }

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>I</span>
          <div>
            IELTS Optimizer<small>PERSONALIZED LEARNING</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => (
            <button aria-label={label} className={page === id ? 'active' : ''} onClick={() => go(id)} key={id}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Target size={17} />
          <b>Evidence before conclusions.</b>
          <span>Activity data is not a measure of mastery.</span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">PERSONALIZED IELTS LEARNING SYSTEM</p>
            <h1>{nav.find(n => n[0] === page)?.[1]}</h1>
          </div>
          <button aria-label="Open profile" className="icon-button" onClick={() => setPage('profile')}>
            <Settings size={18} />
          </button>
        </header>
        {page === 'dashboard' && <Dashboard s={s} go={setPage} />}
        {page === 'plan' && <Plan s={s} setS={setS} note={note} />}
        {page === 'practice' && <Practice s={s} setS={setS} note={note} ids={ids} go={setPage} />}
        {page === 'errors' && <Errors s={s} setS={setS} retest={retest} go={setPage} note={note} />}
        {page === 'record' && <Record s={s} setS={setS} note={note} />}
        {page === 'network' && <LearningNetwork />}
        {page === 'design' && <LearningDesign />}
        {page === 'profile' && <Profile s={s} setS={setS} note={note} />}
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  )
}

function Dashboard({ s, go }: { s: Store; go: (p: Page) => void }) {
  const m = minutesByDate(s.sessions),
    today = Math.round(m[localDate(new Date().toISOString())] || 0),
    open = s.errors.filter(isErrorOpen),
    rec = recommendations(s.profile, s.attempts, s.errors, s.plan)

  return (
    <>
      <section className="hero-card">
        <div>
          <span className="eyebrow">YOUR NEXT LEARNING ACTION</span>
          <h2>{rec.title}</h2>
          <p>{rec.reason}</p>
          <button className="primary" onClick={() => go(rec.page)}>
            Open action →
          </button>
        </div>
      </section>
      <div className="metrics">
        <Metric icon={<Target />} label="Target band" value={s.profile.targetBand ? `${s.profile.targetBand}` : 'Not set'} />
        <Metric icon={<Clock3 />} label="Today" value={`${today} min`} />
        <Metric icon={<BookOpen />} label="Attempts" value={`${s.attempts.length}`} />
        <Metric icon={<RotateCcw />} label="Open errors" value={`${open.length}`} />
      </div>
      <Heatmap s={s} />
    </>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  )
}

function Heatmap({ s }: { s: Store }) {
  const map = minutesByDate(s.sessions)
  const today = toLocalDateString(new Date())
  const [selected, setSelected] = useState(today)

  const initialDate = new Date()
  const [viewYear, setViewYear] = useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth() + 1) // 1 to 12

  const cells = getMonthGrid(viewYear, viewMonth)
  const m = map[selected] || 0
  const goal = s.profile.dailyGoalMinutes || 0

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(y => y - 1)
      setViewMonth(12)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(y => y + 1)
      setViewMonth(1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const onSelectDate = (cell: CalendarDay) => {
    setSelected(cell.date)
    if (cell.isAdjacentMonth) {
      setViewYear(cell.year)
      setViewMonth(cell.month)
    }
  }

  return (
    <section className="panel calendar-panel">
      <div className="calendar-selected-header">
        <span className="eyebrow">SELECTED DATE</span>
        <h3 className="calendar-selected-title">{formatSelectedDateHeader(selected)}</h3>
      </div>

      <div className="calendar-nav-bar">
        <h4 className="calendar-month-heading">{formatMonthHeading(viewYear, viewMonth)}</h4>
        <div className="calendar-nav-buttons">
          <button
            type="button"
            aria-label="Previous month"
            className="calendar-nav-btn"
            onClick={prevMonth}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            className="calendar-nav-btn"
            onClick={nextMonth}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="calendar-grid-container">
        <div className="calendar-weekdays" role="row">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <span key={d} className="calendar-weekday-label">{d}</span>
          ))}
        </div>

        <div className="calendar-days-grid" role="grid">
          {cells.map(cell => {
            const v = map[cell.date] || 0
            const rest = s.profile.daysOff.includes(cell.date)
            const isSelected = selected === cell.date
            const hasActivity = v > 0
            const level = heatLevel(v, goal)

            return (
              <button
                key={cell.date}
                type="button"
                aria-label={`${cell.date}: ${Math.round(v)} minutes${rest ? ', planned rest day' : ''}${isSelected ? ', selected' : ''}`}
                aria-selected={isSelected}
                className={[
                  'calendar-day-btn',
                  cell.isAdjacentMonth ? 'adjacent-month' : 'current-month',
                  hasActivity ? `cal-heat-${level}` : 'no-heat',
                  rest ? 'rest-day' : '',
                  isSelected ? 'selected-date' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectDate(cell)}
              >
                <span className={`calendar-day-circle ${isSelected ? 'selected-circle' : ''}`}>
                  {cell.dayNumber}
                </span>
                {hasActivity && <span className="calendar-activity-dot" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="heatmap-detail">
        <b>{selected}</b>
        <span>
          {Math.round(m)} minutes{goal ? ` · ${Math.round((m / goal) * 100)}% of ${goal}-minute goal` : ''}
        </span>
        <span>{s.profile.daysOff.includes(selected) ? 'Planned rest day' : ''}</span>
      </div>

      <div className="legend">
        <span>0</span>
        {[0, 1, 2, 3, 4, 5].map(x => (
          <i className={`heat l${x}`} key={x} />
        ))}
        <span>Goal+</span>
        <span className="legend-selected-indicator">
          <span className="legend-blue-dot" /> Selected date
        </span>
      </div>
    </section>
  )
}

export function Practice({ s, setS, note, ids, go }: { s: Store; setS: (s: Store) => void; note: (x: string) => void; ids: string[]; go?: (p: Page) => void }) {
  const isRetest = ids.length > 0
  const practiceCount = s.attempts.filter(x => x.kind === 'practice').length
  const targetErrors = isRetest ? s.errors.filter(e => ids.includes(e.id)) : []
  const targetObjectiveIds = targetErrors.map(e => e.objectiveId || getObjectiveId(e))

  // Separate ordinary practice passages from Retest passages:
  const p = isRetest
    ? (retestPassages[0] || passages[1])
    : practicePassages[practiceCount % practicePassages.length]

  // Filter questions for retest so only the targeted objective is tested:
  const isTargetedRetest = isRetest && targetObjectiveIds.length > 0
  const activeQuestions = isTargetedRetest
    ? getRetestQuestions(p, targetObjectiveIds)
    : p.questions

  const hasNoMatchingRetest = isRetest && activeQuestions.length === 0

  const [a, setA] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Attempt>()

  const submit = () => {
    if (!canSubmitRetest(isRetest, activeQuestions)) return

    const x: Attempt = {
      id: uid('attempt'),
      passageId: p.id,
      skill: 'Reading',
      answers: a,
      score: scoreAttempt(activeQuestions, a),
      total: activeQuestions.length,
      kind: isRetest ? 'retest' : 'practice',
      createdAt: new Date().toISOString(),
      objectiveIds: activeQuestions.map(q => getObjectiveId(q)),
      targetErrorIds: isRetest ? ids : undefined,
      targetObjectiveId: targetObjectiveIds[0],
    }
    const errors = mergeAttemptErrors(s.errors, x, activeQuestions)
    setS({ ...s, attempts: [...s.attempts, x], errors })
    setResult(x)
    note('Attempt saved. Review each answer and reflect on your strategy.')
  }

  return (
    <section className="practice-layout">
      <article className="panel passage">
        <span className="eyebrow">READING · {p.level} · {p.minutes} MIN</span>
        <h2>{p.title}</h2>
        {p.text.split('\n\n').map((x, i) => (
          <p key={i}>{x}</p>
        ))}
      </article>
      <article className="panel questions">
        <h3>{isRetest ? 'Retest · targeted objective check' : 'Check your understanding'}</h3>
        {hasNoMatchingRetest ? (
          <div className="unmatched-retest-notice" role="alert" style={{ display: 'grid', gap: '12px', padding: '12px 0' }}>
            <p className="status">No matching retest item is available for this learning objective.</p>
            <p className="muted">
              The retest passage does not contain a question for "{targetObjectiveIds.join(', ')}". Retest submission is prevented to avoid testing unrelated skills.
            </p>
            {go && (
              <button type="button" className="secondary" onClick={() => go('errors')}>
                ← Return to Error Review
              </button>
            )}
          </div>
        ) : result ? (
          <Result x={result} qs={activeQuestions} s={s} setS={setS} />
        ) : (
          <>
            {activeQuestions.map((q, i) => (
              <QuestionCard key={q.id} q={q} i={i} answer={a[q.id]} onAnswer={x => setA({ ...a, [q.id]: x })} />
            ))}
            <button className="primary full" onClick={submit}>
              Submit attempt
            </button>
          </>
        )}
      </article>
    </section>
  )
}

function QuestionCard({ q, i, answer, onAnswer }: { q: Question; i: number; answer?: string; onAnswer: (x: string) => void }) {
  return (
    <div className="question">
      <b>
        {i + 1} · {q.objective}
      </b>
      <h3>{q.prompt}</h3>
      <div className="options">
        {q.options.map(o => (
          <label className={answer === o ? 'chosen' : ''} key={o}>
            <input type="radio" name={q.id} checked={answer === o} onChange={() => onAnswer(o)} />
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

function Result({ x, qs, s, setS }: { x: Attempt; qs: Question[]; s: Store; setS: (s: Store) => void }) {
  const [r, setR] = useState(x.reflection || {}),
    save = () => setS({ ...s, attempts: s.attempts.map(a => (a.id === x.id ? { ...a, reflection: r } : a)) })

  return (
    <div className="result">
      <h2>
        {x.score}/{x.total}
      </h2>
      <p>Practice evidence, not an official IELTS band score.</p>
      {qs.map(q => {
        const ok = x.answers[q.id] === q.answer
        return (
          <div className={`feedback ${ok ? 'correct' : 'incorrect'}`} key={q.id}>
            <b>
              {ok ? '✓' : '×'} {q.objective}
            </b>
            <span>Your answer: {x.answers[q.id] || 'No answer'}</span>
            {!ok && <small>Correct: {q.answer}. Evidence cue: {q.explanation}</small>}
          </div>
        )
      })}
      <div className="reflection">
        <h3>Short reflection</h3>
        <p className="muted">What evidence supported your choice? What will you change next time?</p>
        <textarea aria-label="Reflection" value={r.evidence || ''} onChange={e => setR({ ...r, evidence: e.target.value })} placeholder="Evidence I used..." />
        <textarea aria-label="Next strategy" value={r.nextStep || ''} onChange={e => setR({ ...r, nextStep: e.target.value })} placeholder="Next strategy..." />
        <button className="secondary" onClick={save}>
          Save reflection
        </button>
      </div>
    </div>
  )
}

function Errors({ s, setS, retest, note, go }: { s: Store; setS: (s: Store) => void; retest: (x: string[]) => void; note: (x: string) => void; go: (p: Page) => void }) {
  return (
    <section className="stack">
      <section className="panel">
        <h3>Error memory</h3>
        <p className="muted">Mistakes remain in history. Retest closes an error only after the same objective is answered correctly.</p>
      </section>
      {s.errors.length ? (
        s.errors.map(e => (
          <section className="panel error-card" key={e.id}>
            <span className={`status ${isErrorOpen(e) ? '' : 'good'}`}>{isErrorOpen(e) ? 'Needs retest' : 'Fixed by Retest'}</span>
            <h3>{e.objective}</h3>
            {e.prompt && (
              <p className="question-copy">
                Question: <b>{e.prompt}</b>
              </p>
            )}
            <p>
              Your answer: <b>{e.learnerAnswer}</b>
            </p>
            <p>
              Correct answer: <b className="green-text">{e.correctAnswer}</b>
            </p>
            <p>{e.explanation}</p>
            <button className="secondary" onClick={() => retest([e.id])}>
              Start Retest →
            </button>
            <button
              className="text-button"
              onClick={() => {
                setS({ ...s, errors: s.errors.map(x => (x.id === e.id ? { ...x, reviewCount: x.reviewCount + 1 } : x)) })
                note('Error reviewed.')
              }}
            >
              Mark reviewed
            </button>
          </section>
        ))
      ) : (
        <section className="panel">
          <p>No errors yet.</p>
          <button className="secondary" onClick={() => go('practice')}>
            Go to practice
          </button>
        </section>
      )}
    </section>
  )
}

function Plan({ s, setS, note }: { s: Store; setS: (s: Store) => void; note: (x: string) => void }) {
  const suggestion = recommendations(s.profile, s.attempts, s.errors, s.plan)
  const add = (source: 'manual' | 'recommended') => {
    const today = localDate(new Date().toISOString())
    if (s.profile.daysOff.includes(today)) {
      note('Today is a planned rest day. Choose another date in Profile.')
      return
    }
    const e = s.errors.find(isErrorOpen),
      x: PlanItem = {
        id: uid('plan'),
        date: today,
        title: source === 'recommended' ? suggestion.title : 'Reading accuracy practice',
        skill: source === 'recommended' ? s.profile.priority : 'Reading',
        objective: e?.objective || 'Build learning evidence',
        minutes: s.profile.dailyGoalMinutes || 30,
        status: 'planned',
        source,
        reason: source === 'recommended' ? suggestion.reason : 'Added manually.'
      }
    setS({ ...s, plan: [...s.plan, x] })
    note('Study plan updated.')
  }

  return (
    <section className="stack">
      <section className="panel">
        <h2>Study Plan</h2>
        <p className="muted">Rules are transparent: priority, goal, open errors and planned rest days shape suggestions.</p>
        <button className="primary" onClick={() => add('recommended')}>
          + Add recommendation
        </button>
        <button className="secondary" onClick={() => add('manual')}>
          Add manual
        </button>
      </section>
      {s.plan.map(p => (
        <section className="panel plan-row" key={p.id}>
          <span>
            {p.source === 'recommended' ? 'Recommended' : 'Manual'} · {p.date}
          </span>
          <h3>{p.title}</h3>
          <small>
            {p.skill} · {p.minutes} min · {p.reason}
          </small>
          <select
            value={p.status}
            onChange={e =>
              setS({
                ...s,
                plan: s.plan.map(x => (x.id === p.id ? { ...x, status: e.target.value as PlanItem['status'] } : x))
              })
            }
          >
            <option value="planned">Planned</option>
            <option value="done">Done</option>
            <option value="skipped">Skipped</option>
          </select>
        </section>
      ))}
    </section>
  )
}

function Record({ s, setS, note }: { s: Store; setS: (s: Store) => void; note: (x: string) => void }) {
  const active = s.activeSession,
    [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!active || active.paused) return
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [active])

  const sec = active
    ? active.accumulatedSeconds + (active.paused ? 0 : (now - new Date(active.lastResumedAt).getTime()) / 1000)
    : 0,
    start = () => {
      const t = new Date().toISOString()
      setS({
        ...s,
        activeSession: { id: uid('session'), startedAt: t, lastResumedAt: t, accumulatedSeconds: 0, paused: false }
      })
    },
    pause = () => {
      if (active)
        setS({
          ...s,
          activeSession: {
            ...active,
            accumulatedSeconds: active.accumulatedSeconds + (Date.now() - new Date(active.lastResumedAt).getTime()) / 1000,
            paused: true
          }
        })
    },
    resume = () => {
      if (active)
        setS({
          ...s,
          activeSession: { ...active, lastResumedAt: new Date().toISOString(), paused: false }
        })
    },
    stop = () => {
      if (!active) return
      const end = new Date().toISOString(),
        seconds =
          active.accumulatedSeconds + (active.paused ? 0 : (Date.now() - new Date(active.lastResumedAt).getTime()) / 1000)
      setS({
        ...s,
        activeSession: undefined,
        sessions: [
          ...s.sessions,
          {
            id: active.id,
            startedAt: active.startedAt,
            endedAt: end,
            minutes: Math.max(1, Math.round(seconds / 60)),
            activity: 'Timer session',
            skill: 'Reading'
          }
        ]
      })
      note('Timer session saved as measured activity.')
    }

  return (
    <section className="stack">
      <section className="panel">
        <h2>{active ? (active.paused ? 'Timer paused' : 'Session in progress') : 'Learning Record'}</h2>
        <p className="timer">
          {Math.floor(sec / 60)
            .toString()
            .padStart(2, '0')}
          :
          {Math.floor(sec % 60)
            .toString()
            .padStart(2, '0')}
        </p>
        {!active ? (
          <button className="primary" onClick={start}>
            Start timer
          </button>
        ) : (
          <>
            <button className="secondary" onClick={active.paused ? resume : pause}>
              {active.paused ? 'Resume' : 'Pause'}
            </button>
            <button className="danger" onClick={stop}>
              Stop and save
            </button>
          </>
        )}
        <p className="muted">Timer sessions are measured. Manual entries are self-reported when added.</p>
      </section>
      <section className="panel">
        <b>{s.sessions.reduce((a, x) => a + x.minutes, 0)} measured minutes</b>
        {s.sessions.length === 0 ? (
          <p className="muted">No study sessions yet.</p>
        ) : (
          s.sessions
            .slice()
            .reverse()
            .map(x => (
              <div className="list-row" key={x.id}>
                <div>
                  <b>{x.activity || 'Study session'}</b>
                  <small>
                    {new Date(x.startedAt).toLocaleString()} → {new Date(x.endedAt).toLocaleString()}
                  </small>
                </div>
                <strong>{x.minutes} min</strong>
              </div>
            ))
        )}
      </section>
      <section className="panel">
        <h3>Reading history</h3>
        {s.attempts.length === 0 ? (
          <p className="muted">No Reading attempts yet.</p>
        ) : (
          s.attempts
            .slice()
            .reverse()
            .map(a => (
              <div className="list-row" key={a.id}>
                <div>
                  <b>
                    {a.kind === 'retest' ? 'Retest' : 'Reading practice'} · {a.score}/{a.total}
                  </b>
                  <small>
                    {new Date(a.createdAt).toLocaleString()} · {a.objectiveIds.length} objectives ·{' '}
                    {a.reflection ? 'Reflection saved' : 'No reflection yet'}
                  </small>
                </div>
                <strong>{Math.round((a.score / a.total) * 100)}%</strong>
              </div>
            ))
        )}
      </section>
    </section>
  )
}

function LearningNetwork() {
  return (
    <section className="stack">
      <section className="panel">
        <h2>Learning Network</h2>
        <p className="muted">Connectivism means following useful links between skills, strategies, evidence and resources.</p>
        <div className="network-card">
          <b>Reading · Main idea · Evidence mapping</b>
          <span>Use the passage, Error Review and Retest as connected nodes.</span>
        </div>
        <div className="network-card">
          <b>British Council IELTS</b>
          <span>Official preparation guidance and sample materials.</span>
          <a href="https://takeielts.britishcouncil.org/take-ielts/prepare" target="_blank" rel="noreferrer">
            Open resource ↗
          </a>
        </div>
        <div className="network-card">
          <b>Cambridge English</b>
          <span>Official IELTS preparation and assessment information.</span>
          <a href="https://www.cambridgeenglish.org/exams-and-tests/ielts/preparation/" target="_blank" rel="noreferrer">
            Open resource ↗
          </a>
        </div>
      </section>
      <section className="panel">
        <h3>Peer Learning</h3>
        <p className="muted">Not available in local-only mode. No peer users or comments are fabricated.</p>
        <p>To enable real collaboration, configure Supabase using the optional environment variables documented in README.</p>
      </section>
    </section>
  )
}

function LearningDesign() {
  return (
    <section className="stack">
      <section className="panel">
        <h2>Learning Design</h2>
        <p className="muted">How the implemented features translate learning theory into concrete actions.</p>
        {[
          ['Behaviorism', 'Reading feedback, Error Review and Retest provide immediate constructive reinforcement.', 'Implemented'],
          ['Cognitivism', 'Questions are chunked; explanations connect answers to passage evidence and objectives.', 'Implemented'],
          ['Constructivism', 'A saved post-attempt reflection asks learners to name evidence and a next strategy.', 'Implemented'],
          ['Connectivism', 'Learning Network links skill, objective, error history and verified external resources. Peer mode is not active locally.', 'Partially implemented']
        ].map(([a, b, c]) => (
          <div className="design-row" key={a}>
            <b>{a}</b>
            <span>{b}</span>
            <em>{c}</em>
          </div>
        ))}
      </section>
      <section className="panel">
        <h3>TPACK mapping</h3>
        <p>
          <b>Content:</b> IELTS Reading passages, question types and objectives.
        </p>
        <p>
          <b>Pedagogy:</b> practice → feedback → reflection → targeted Retest.
        </p>
        <p>
          <b>Technology:</b> scoring, local records, Heatmap and resource links.
        </p>
      </section>
      <section className="panel">
        <h3>SAMR with one Reading task</h3>
        <p>
          <b>Substitution:</b> answer online. <b>Augmentation:</b> automatic scoring and explanations. <b>Modification:</b> Error Memory selects a different Retest set. <b>Redefinition:</b> planned future peer exchange with a real backend; not claimed as active.
        </p>
        <small>Framework reference: Puentedura's SAMR model; implementation status is stated explicitly.</small>
      </section>
    </section>
  )
}

function Profile({ s, setS, note }: { s: Store; setS: (s: Store) => void; note: (x: string) => void }) {
  const [p, setP] = useState<Profile>(s.profile),
    [goalError, setGoalError] = useState('')

  const save = () => {
    if (p.targetBand !== undefined && (p.targetBand < 1 || p.targetBand > 9)) {
      setGoalError('Band must be between 1 and 9.')
      return
    }
    if (p.dailyGoalMinutes !== undefined && (p.dailyGoalMinutes < 1 || p.dailyGoalMinutes > 1440)) {
      setGoalError('Daily goal must be between 1 and 1440 minutes.')
      return
    }
    setS({ ...s, profile: p })
    note('Profile saved.')
    setGoalError('')
  }

  return (
    <section className="panel">
      <h2>Learner Profile</h2>
      <p className="muted">Goals are self-reported; they are not an official assessment.</p>
      <div className="form-grid">
        <label>
          Target band
          <input
            type="number"
            min="1"
            max="9"
            step=".5"
            value={p.targetBand || ''}
            onChange={e => setP({ ...p, targetBand: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label>
          Current level
          <input placeholder="e.g. B2" value={p.currentLevel || ''} onChange={e => setP({ ...p, currentLevel: e.target.value })} />
        </label>
        <label>
          Exam date
          <input type="date" value={p.examDate || ''} onChange={e => setP({ ...p, examDate: e.target.value })} />
        </label>
        <label>
          Daily goal (minutes)
          <input
            type="number"
            min="1"
            max="1440"
            value={p.dailyGoalMinutes || ''}
            onChange={e => setP({ ...p, dailyGoalMinutes: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label>
          Priority
          <select value={p.priority} onChange={e => setP({ ...p, priority: e.target.value as Profile['priority'] })}>
            <option>Reading</option>
            <option>Listening</option>
            <option>Writing</option>
            <option>Speaking</option>
          </select>
        </label>
        <label>
          Planned rest dates
          <input
            placeholder="YYYY-MM-DD, YYYY-MM-DD"
            value={p.daysOff.join(', ')}
            onChange={e =>
              setP({
                ...p,
                daysOff: e.target.value
                  .split(',')
                  .map(x => x.trim())
                  .filter(Boolean)
              })
            }
          />
        </label>
      </div>
      {goalError && <p className="status">{goalError}</p>}
      <button className="primary" onClick={save}>
        Save profile
      </button>
      <button
        className="danger-outline"
        onClick={() => {
          clearStore()
          location.reload()
        }}
      >
        Clear local data
      </button>
    </section>
  )
}
