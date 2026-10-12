import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'
import { demoData } from './demo-data'

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`API respondeu com HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export async function askAssistant(message: string): Promise<{ answer: string; provider: 'mock' | 'gemini' }> {
  const response = await fetch(`${apiBase}/assistant`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`API respondeu com HTTP ${response.status}`)
  return response.json() as Promise<{ answer: string; provider: 'mock' | 'gemini' }>
}

export async function loadDashboardData(): Promise<DashboardData> {
  try {
    const [events, alerts] = await Promise.all([
      fetchJson<AuthenticationEvent[]>('/events'),
      fetchJson<SecurityAlert[]>('/alerts'),
    ])
    return { events, alerts, source: 'api' }
  } catch {
    // A demonstração continua visível se a API local ainda não estiver iniciada.
    return { ...demoData, source: 'demo' }
  }
}
