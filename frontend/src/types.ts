export type AuthenticationEvent = {
  timestamp: string
  ip_address: string
  username: string
  outcome: 'failed' | 'success'
}

export type SecurityAlert = {
  ip_address: string
  first_failure: string
  last_failure: string
  detected_at: string
  failure_count: number
  usernames: string[]
  message: string
}

export type DashboardData = {
  events: AuthenticationEvent[]
  alerts: SecurityAlert[]
  source: 'api' | 'demo'
}
