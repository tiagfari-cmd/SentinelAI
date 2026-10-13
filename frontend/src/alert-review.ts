import type { AlertReviewRequest, SecurityAlert } from './types'

export const reviewLabels = { open: 'Por tratar', investigating: 'Em análise', resolved: 'Resolvido' }
export type AlertFilter = 'active' | 'all' | SecurityAlert['review_status']

export function matchesAlertFilter(alert: SecurityAlert, filter: AlertFilter) {
  return filter === 'all' || (filter === 'active' ? alert.review_status !== 'resolved' : alert.review_status === filter)
}

export function simulateReview(alert: SecurityAlert, request: AlertReviewRequest): SecurityAlert {
  if (request.expected_revision !== alert.review_revision) throw new Error('Atualiza os detalhes antes de guardar.')
  const note = request.review_note.trim()
  if (request.review_status === 'resolved' && !note) throw new Error('Resolver exige uma nota de investigação.')
  return { ...alert, review_status: request.review_status, review_note: note,
    review_revision: alert.review_revision + 1, reviewed_at: new Date().toISOString() }
}
