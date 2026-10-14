import { api } from '../api'

// One booked date range of a tent, from GET /api/tents/occupancy. It is the
// same for every guest - a tent somebody else booked shows as taken for you too -
// and it carries no personal data (no guest, price or reservation id).
export type TentBooking = {
  tentId: number
  startDate: string
  endDate: string
}

/** Booked ranges that overlap [start, end), grouped by tent id. */
export async function fetchOccupancyByTent(
  start: string,
  end: string,
): Promise<Record<number, TentBooking[]>> {
  const query = new URLSearchParams({ from: start, to: end })
  const bookings = await api<TentBooking[]>(`/tents/occupancy?${query}`)
  const byTent: Record<number, TentBooking[]> = {}
  for (const b of bookings) (byTent[b.tentId] ??= []).push(b)
  return byTent
}

// Same rule the server enforces when booking: a stay [start, end) clashes with
// a booking when the ranges overlap (checking in on someone's check-out day is fine).
export function findBooking(
  bookings: TentBooking[],
  start: string,
  end: string,
): TentBooking | null {
  return bookings.find((b) => start < b.endDate && b.startDate < end) ?? null
}
