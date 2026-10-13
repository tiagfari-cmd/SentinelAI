export type AuthenticationEvent = {
  timestamp: string
  ip_address: string
  username: string
  outcome: 'failed' | 'success'
}

export type SecurityAlert = {
  id: number
  review_status: 'open' | 'investigating' | 'resolved'
  review_note: string
  review_revision: number
  reviewed_at: string | null
  ip_address: string
  first_failure: string
  last_failure: string
  detected_at: string
  failure_count: number
  usernames: string[]
  message: string
}

export type AlertReviewRequest = {
  review_status: SecurityAlert['review_status']
  review_note: string
  expected_revision: number
}

export type DashboardData = {
  events: AuthenticationEvent[]
  alerts: SecurityAlert[]
  source: 'api' | 'demo' | 'local'
  eventTotal?: number
  alertTotal?: number
}
