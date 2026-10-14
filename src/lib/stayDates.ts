// Shared check-in / check-out range so the campsite map and the booking page
// always show availability for the SAME selected dates. Persisted for the tab
// (sessionStorage); falls back to a sensible default.

const KEY = 'camping.stayDates'

export type StayRange = { start: string; end: string }

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function defaultStayRange(): StayRange {
  const start = new Date()
  start.setDate(start.getDate() + 14)
  const end = new Date(start)
  end.setDate(end.getDate() + 3)
  return { start: isoDate(start), end: isoDate(end) }
}

export function readStayRange(): StayRange {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<StayRange>
      const today = isoDate(new Date())
      if (
        typeof p.start === 'string' &&
        typeof p.end === 'string' &&
        p.start >= today &&
        p.end > p.start
      ) {
        return { start: p.start, end: p.end }
      }
    }
  } catch {
    /* sessionStorage unavailable or corrupt - use the default */
  }
  return defaultStayRange()
}

export function writeStayRange(range: StayRange): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(range))
  } catch {
    /* ignore - the range just won't persist across navigation */
  }
}
