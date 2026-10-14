import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../api'
import { useAuth } from '../auth'
import type { PagedResult, Review } from '../types'

const PAGE_SIZE = 10
const MAX_TEXT = 1000
// The API caps a page at 100 rows; the rating summary is computed from at most
// this many of the newest reviews (and says so when there are more).
const STATS_SAMPLE = 100

const RATING_HE = ['', 'גרוע', 'לא משהו', 'סביר', 'טוב מאוד', 'מעולה']

type Stats = { average: number; counts: number[]; sample: number; total: number }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

function Stars({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }) {
  return (
    <span className={`stars stars--${size}`} aria-label={`${value} מתוך 5 כוכבים`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(value) ? 'star is-on' : 'star'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

// Public guest reviews (GET /api/reviews needs no token), so every visitor sees
// them. Only a signed-in user gets the form, and the author's name is taken by
// the server from their JWT - the form has no name field.
export function ReviewsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'

  const [reviews, setReviews] = useState<Review[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [formMsg, setFormMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const loadPage = useCallback(async (p: number) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api<PagedResult<Review>>(`/reviews?page=${p}&pageSize=${PAGE_SIZE}`)
      setReviews((prev) =>
        p === 1 ? res.items : [...prev, ...res.items.filter((r) => !prev.some((x) => x.id === r.id))],
      )
      setTotal(res.totalCount)
      setHasMore(res.hasNextPage)
      setPage(p)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.detail : 'לא ניתן לטעון את ההמלצות כרגע.')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await api<PagedResult<Review>>(`/reviews?page=1&pageSize=${STATS_SAMPLE}`)
      if (res.items.length === 0) {
        setStats(null)
        return
      }
      const counts = [0, 0, 0, 0, 0, 0]
      for (const r of res.items) counts[r.rating] = (counts[r.rating] ?? 0) + 1
      const sum = res.items.reduce((s, r) => s + r.rating, 0)
      setStats({
        average: sum / res.items.length,
        counts,
        sample: res.items.length,
        total: res.totalCount,
      })
    } catch {
      setStats(null) // the list still shows; the summary is just hidden
    }
  }, [])

  useEffect(() => {
    void loadPage(1)
    void loadStats()
  }, [loadPage, loadStats])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormMsg(null)
    if (rating < 1) {
      setFormMsg({ kind: 'error', text: 'בחרו דירוג של 1 עד 5 כוכבים.' })
      return
    }
    if (!text.trim()) {
      setFormMsg({ kind: 'error', text: 'כתבו כמה מילים על החוויה שלכם.' })
      return
    }
    setPosting(true)
    try {
      await api<Review>('/reviews', {
        method: 'POST',
        body: JSON.stringify({ rating, text: text.trim() }),
      })
      setRating(0)
      setText('')
      setFormMsg({ kind: 'ok', text: 'תודה! ההמלצה פורסמה 🎉' })
      await Promise.all([loadPage(1), loadStats()])
    } catch (err) {
      setFormMsg({
        kind: 'error',
        text:
          err instanceof ApiError && err.status === 401
            ? 'תוקף ההתחברות פג. התחברו מחדש כדי לפרסם.'
            : err instanceof ApiError
              ? `הפרסום נכשל: ${err.detail}`
              : 'הפרסום נכשל. נסו שוב.',
      })
    } finally {
      setPosting(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('למחוק את ההמלצה?')) return
    try {
      await api(`/reviews/${id}`, { method: 'DELETE' })
      setReviews((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      void loadStats()
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.detail : 'המחיקה נכשלה.')
    }
  }

  const shown = hover || rating

  return (
    <div className="page reviews-page">
      <section className="reviews-hero">
        <div className="reviews-hero__copy">
          <span className="reviews-hero__eyebrow">✨ המלצות אורחים</span>
          <h1 className="reviews-hero__title">
            מה מספרים <span className="reviews-hero__accent">מסביב למדורה</span>
          </h1>
          <p className="reviews-hero__sub">
            חוויות אמיתיות של אורחים שישנו אצלנו מתחת לכוכבים. כל ההמלצות גלויות לכולם.
          </p>
        </div>

        <div className="reviews-stats" aria-live="polite">
          {stats ? (
            <>
              <div className="reviews-stats__score">
                <b>{stats.average.toFixed(1)}</b>
                <Stars value={stats.average} size="lg" />
                <span>
                  {stats.total} {stats.total === 1 ? 'המלצה' : 'המלצות'}
                  {stats.total > stats.sample && ` · ממוצע ${stats.sample} האחרונות`}
                </span>
              </div>
              <ul className="reviews-stats__bars">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = stats.counts[n] ?? 0
                  const pct = stats.sample ? (c / stats.sample) * 100 : 0
                  return (
                    <li key={n}>
                      <span className="reviews-stats__n">{n}★</span>
                      <span className="reviews-stats__track">
                        <span className="reviews-stats__fill" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="reviews-stats__c">{c}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <div className="reviews-stats__empty">
              <span className="reviews-stats__fire" aria-hidden="true">🔥</span>
              {loaded ? 'עוד אין דירוגים — היו הראשונים!' : 'טוען דירוגים…'}
            </div>
          )}
        </div>
      </section>

      {user ? (
        <form className="card review-form form" onSubmit={submit}>
          <div className="review-form__head">
            <span className="review-avatar review-avatar--me" aria-hidden="true">
              {initials(user.fullName)}
            </span>
            <div>
              <h2 className="review-form__title">שתפו את החוויה שלכם</h2>
              <span className="review-form__as">
                יפורסם בשם <strong>{user.fullName}</strong>
              </span>
            </div>
          </div>

          <div className="field">
            <span className="field__label" id="rating-label">איך היה?</span>
            <div
              className="star-input"
              role="radiogroup"
              aria-labelledby="rating-label"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} כוכבים`}
                  className={n <= shown ? 'star-input__btn is-on' : 'star-input__btn'}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
              <span className={shown ? 'star-input__label is-on' : 'star-input__label'}>
                {shown ? RATING_HE[shown] : 'בחרו דירוג'}
              </span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="review-text">ההמלצה שלך</label>
            <textarea
              id="review-text"
              rows={4}
              maxLength={MAX_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="מה אהבתם במיוחד? המדורה, השקט, האוהל?"
            />
            <span className="field__count">{text.length}/{MAX_TEXT}</span>
          </div>

          {formMsg && (
            <p className={`banner banner--${formMsg.kind === 'ok' ? 'ok' : 'error'}`} role="status">
              {formMsg.text}
            </p>
          )}

          <button className="btn btn--primary review-form__submit" type="submit" disabled={posting}>
            {posting ? 'מפרסם…' : 'פרסום המלצה'}
          </button>
        </form>
      ) : (
        <div className="card review-login">
          <span className="review-login__icon" aria-hidden="true">⛺</span>
          <div>
            <strong>ישנתם אצלנו? ספרו לכולם!</strong>
            <span>רק אורחים מחוברים יכולים לכתוב המלצה.</span>
          </div>
          <Link className="btn btn--primary" to="/login">
            התחברות
          </Link>
        </div>
      )}

      {loadError && (
        <p className="banner banner--error page__alert" role="alert">{loadError}</p>
      )}

      {loaded && !loading && total === 0 && !loadError && (
        <p className="notice">עדיין אין המלצות. היו הראשונים! ✨</p>
      )}

      <ul className="review-list">
        {reviews.map((r, i) => (
          <li
            key={r.id}
            className={r.rating === 5 ? 'review review--top' : 'review'}
            style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
          >
            <span className="review__quote" aria-hidden="true">”</span>
            <Stars value={r.rating} />
            <p className="review__text">{r.text}</p>
            <div className="review__foot">
              <span className="review-avatar" aria-hidden="true">{initials(r.authorName)}</span>
              <span className="review__who">
                <span className="review__author">{r.authorName}</span>
                <time dateTime={r.createdAt}>{fmtDate(r.createdAt)}</time>
              </span>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm review__delete"
                  onClick={() => remove(r.id)}
                >
                  מחיקה
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="reviews-more">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={loading}
            onClick={() => loadPage(page + 1)}
          >
            {loading ? 'טוען…' : 'הצגת המלצות נוספות'}
          </button>
        </div>
      )}
    </div>
  )
}
