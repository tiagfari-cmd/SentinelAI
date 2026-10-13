import { afterEach, expect, it, vi } from 'vitest'
import { analyzeLocalJson } from '../src/local-analysis'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })
it('never sends or persists imported logs or local review notes, even with a configured private API', async () => {
  vi.resetModules(); vi.stubEnv('MODE', 'production'); vi.stubEnv('VITE_API_BASE_URL', 'https://example.invalid')
  vi.stubGlobal('fetch', vi.fn())
  const localStorage = { setItem: vi.fn(), getItem: vi.fn() }; vi.stubGlobal('localStorage', localStorage)
  const data = analyzeLocalJson(JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ timestamp: `2026-10-13T12:00:0${i}Z`, ip_address: '192.0.2.1', username: 'fictional-user', outcome: 'failed' }))))
  const { saveAlertReview, setAccessToken } = await import('../src/api')
  setAccessToken('fictional-operator-token')
  const saved = await saveAlertReview(data.alerts[0], { review_status: 'resolved', review_note: 'Local-only test note.', expected_revision: 0 }, true)
  expect(saved.review_status).toBe('resolved')
  expect(data.alerts[0].review_status).toBe('open')
  expect(fetch).not.toHaveBeenCalled()
  expect(localStorage.setItem).not.toHaveBeenCalled()
  expect(localStorage.getItem).not.toHaveBeenCalled()
})
