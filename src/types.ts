// Mirrors the server's response DTOs (Camping.API/DTOs/Responses) and the
// PagedResult<T> wrapper (Camping.Core/Querying/PagedResult).

export type PagedResult<T> = {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export type Tent = {
  id: number
  campingSiteId: number
  label: string
  type: number
  capacity: number
  pricePerNight: number
  isActive: boolean
}

export type AuthResponse = {
  accessToken: string
  expiresAtUtc: string
  email: string
  fullName: string
  role: string
}

// Shape of GET /api/auth/me
export type CurrentUser = {
  id: string
  email: string
  fullName: string
  role: string
}

export type ReservationResponse = {
  id: number
  tentId: number
  userId: number
  startDate: string
  endDate: string
  status: number
  totalPrice: number
  createdAt: string
}

// GET /api/camping-sites - used only to name the site on the PDF confirmation.
export type CampSite = {
  id: number
  name: string
  description: string | null
  address: string
  createdAt: string
}

// Camping.Core/Enums/TentType
export const TENT_TYPES = ['Standard', 'Family', 'Glamping'] as const
export const TENT_TYPES_HE = ['רגיל', 'משפחתי', 'יוקרתי'] as const

// Camping.Core/Enums/ReservationStatus: Pending=0, Confirmed=1, Cancelled=2, Completed=3.
// A cancelled reservation no longer holds the tent - matches the server's
// availability rule in ReservationService.EnsureTentIsFreeAsync.
export const RESERVATION_STATUS_CANCELLED = 2

// Hebrew label + pill modifier per ReservationStatus value (index = enum value).
export const RESERVATION_STATUS_HE = ['ממתין', 'מאושר', 'מבוטל', 'הושלם'] as const
export const RESERVATION_STATUS_KEY = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
] as const

// Subset of GET /api/users (Admin-only) used by the reservation schedule.
export type AdminUser = {
  id: number
  fullName: string
  email: string
}

// GET /api/reviews (public). The author name comes from the server, taken from
// the account that posted the review - the client never sends a name.
export type Review = {
  id: number
  rating: number
  text: string
  authorName: string
  createdAt: string
}
