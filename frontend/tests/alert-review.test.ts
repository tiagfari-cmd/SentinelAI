import { describe, expect, it } from 'vitest'
import { demoAlerts } from '../src/demo-data'
import { matchesAlertFilter, simulateReview } from '../src/alert-review'
import { demoReply } from '../src/demo-assistant'

describe('human review helpers', () => {
  it('keeps resolved evidence but excludes it from pending alerts', () => {
    const resolved = simulateReview(demoAlerts[0], { review_status: 'resolved', review_note: 'Testes autorizados.', expected_revision: 0 })
    expect(matchesAlertFilter(resolved, 'active')).toBe(false)
    expect(matchesAlertFilter(resolved, 'all')).toBe(true)
    expect(matchesAlertFilter(resolved, 'resolved')).toBe(true)
    expect(matchesAlertFilter(resolved, 'open')).toBe(false)
    expect(resolved.failure_count).toBe(demoAlerts[0].failure_count)
  })
  it('requires a conclusion and refuses stale simulated edits', () => {
    expect(() => simulateReview(demoAlerts[0], { review_status: 'resolved', review_note: ' ', expected_revision: 0 })).toThrow('nota')
    expect(() => simulateReview(demoAlerts[0], { review_status: 'open', review_note: '', expected_revision: 1 })).toThrow('Atualiza')
  })
})

describe('plain-language local guide, not an LLM', () => {
  it.each(['como que funciona esta dashboard', 'como funciona este dasboard', 'Explica o painel'])('explains the dashboard: %s', (question) => {
    expect(demoReply(question)).toContain('quatro indicadores')
    expect(demoReply(question)).toContain('fictício')
  })
  it.each(['Como resolver um alerta?', 'Quero marcar como resolvido'])('explains human resolution: %s', (question) => {
    expect(demoReply(question)).toContain('não apaga')
  })
  it('does not claim to be a model or an enterprise service', () => {
    expect(demoReply('És um mini LLM?')).toContain('não de um LLM')
    expect(demoReply('Uma empresa pode integrar?')).toContain('piloto')
    expect(demoReply('Como exportar JSON?')).toContain('filtro')
    expect(demoReply('Conta-me uma história inédita')).toContain('pré-definidas')
  })
})
