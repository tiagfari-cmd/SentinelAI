import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'

const now = Date.now()
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

export const demoEvents: AuthenticationEvent[] = [
  { timestamp: minutesAgo(0.45), ip_address: '203.0.113.42', username: 'ana.silva', outcome: 'failed' },
  { timestamp: minutesAgo(0.55), ip_address: '198.51.100.27', username: 'miguel', outcome: 'success' },
  { timestamp: minutesAgo(0.60), ip_address: '203.0.113.42', username: 'ana.silva', outcome: 'failed' },
  { timestamp: minutesAgo(0.75), ip_address: '203.0.113.42', username: 'ana.silva', outcome: 'failed' },
  { timestamp: minutesAgo(0.90), ip_address: '203.0.113.42', username: 'ana.silva', outcome: 'failed' },
  { timestamp: minutesAgo(1.00), ip_address: '192.0.2.81', username: 'ines', outcome: 'success' },
  { timestamp: minutesAgo(1.05), ip_address: '203.0.113.42', username: 'ana.silva', outcome: 'failed' },
  { timestamp: minutesAgo(1.2), ip_address: '198.51.100.27', username: 'miguel', outcome: 'failed' },
]

export const demoAlerts: SecurityAlert[] = [
  {
    ip_address: '203.0.113.42',
    first_failure: minutesAgo(1.05),
    last_failure: minutesAgo(0.45),
    detected_at: minutesAgo(0.45),
    failure_count: 5,
    usernames: ['ana.silva'],
    message: 'Cinco falhas de autenticação observadas deste IP numa janela curta. Requer investigação; não confirma um ataque.',
  },
]

export const demoData: Omit<DashboardData, 'source'> = {
  events: demoEvents,
  alerts: demoAlerts,
}
