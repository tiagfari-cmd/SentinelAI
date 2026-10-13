import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'
import { demoData } from './demo-data'

const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '/api')
let accessToken = ''

export class UnauthorizedError extends Error {
  constructor(message = 'É necessário um token de acesso.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ApiResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiResponseError'
  }
}

export function setAccessToken(token: string) {
  accessToken = token
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

async function fetchPage<T>(path: string): Promise<{ rows: T[]; total: number }> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: headers({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(5000),
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiResponseError(errorBody?.detail || `API respondeu com HTTP ${response.status}`)
  }
  const rows = await response.json() as T[]
  const totalHeader = response.headers.get('X-Total-Count')
  const parsedTotal = totalHeader === null ? rows.length : Number(totalHeader)
  return { rows, total: Number.isFinite(parsedTotal) ? Math.max(rows.length, parsedTotal) : rows.length }
}

export async function askAssistant(message: string): Promise<{ answer: string; provider: 'mock' | 'gemini' }> {
  const response = await fetch(`${apiBase}/assistant`, {
    method: 'POST',
    headers: headers({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(25_000),
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(errorBody?.detail || `API respondeu com HTTP ${response.status}`)
  }
  return response.json() as Promise<{ answer: string; provider: 'mock' | 'gemini' }>
}

export async function verifyAccessToken(token: string): Promise<void> {
  const response = await fetch(`${apiBase}/auth/check`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })
  if (response.status === 401) throw new UnauthorizedError('Token incorreto. Confirma o token configurado no backend.')
  if (!response.ok) throw new Error(`Não foi possível validar o acesso (HTTP ${response.status}).`)
}

export async function loadDashboardData(): Promise<DashboardData> {
  try {
    const [events, alerts] = await Promise.all([
      fetchPage<AuthenticationEvent>('/events?limit=500&order=desc'),
      fetchPage<SecurityAlert>('/alerts?limit=500&order=desc'),
    ])
    return { events: events.rows, alerts: alerts.rows, eventTotal: events.total, alertTotal: alerts.total, source: 'api' }
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ApiResponseError) throw error
    // A demonstração continua visível se a API local ainda não estiver iniciada.
    return { ...demoData, source: 'demo' }
  }
}
