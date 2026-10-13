import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public demo stays browser-only', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'demo')
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.invalid')
  })

  it('loads fictional events and alerts without fetch', async () => {
    const { loadDashboardData } = await import('../src/api')
    const data = await loadDashboardData()
    expect(data.source).toBe('demo')
    expect(data.events).toHaveLength(8)
    expect(data.alerts).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a fresh sample on refresh', async () => {
    const { loadDashboardData } = await import('../src/api')
    const first = await loadDashboardData()
    first.events.length = 0
    expect((await loadDashboardData()).events).toHaveLength(8)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['Como investigar o alerta?', 'Quais os próximos passos?', 'É gratuito?', 'Olá'])('answers locally: %s', async (message) => {
    const { askAssistant } = await import('../src/api')
    const reply = await askAssistant(message)
    expect(reply.provider).toBe('local')
    expect(reply.answer.length).toBeGreaterThan(20)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['pt', 'Como funciona o dashboard?', 'quatro indicadores'],
    ['en', 'How does the dashboard work?', 'four indicators'],
  ] as const)('answers in the selected public guide language (%s) without network requests', async (language, message, phrase) => {
    const { askAssistant } = await import('../src/api')
    const reply = await askAssistant(message, language)
    expect(reply.provider).toBe('local')
    expect(reply.answer).toContain(phrase)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not send a visitor token to any server', async () => {
    const { verifyAccessToken, setAccessToken, loadDashboardData } = await import('../src/api')
    setAccessToken('fake-test-token')
    await expect(verifyAccessToken('fake-test-token')).rejects.toThrow('não aceita tokens')
    await loadDashboardData()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('simulates a review locally and resets it on refresh', async () => {
    const { loadDashboardData, saveAlertReview } = await import('../src/api')
    const original = (await loadDashboardData()).alerts[0]
    const reviewed = await saveAlertReview(original, { review_status: 'resolved', review_note: ' Teste fictício. ', expected_revision: 0 })
    expect(reviewed.review_status).toBe('resolved')
    expect(reviewed.review_note).toBe('Teste fictício.')
    expect(reviewed.review_revision).toBe(1)
    expect(original.review_status).toBe('open')
    expect((await loadDashboardData()).alerts[0].review_status).toBe('open')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('full installation retains API behavior', () => {
  beforeEach(() => vi.stubEnv('MODE', 'production'))

  it('loads pages with bearer headers and totals', async () => {
    const event = { timestamp: '2026-10-13T09:00:00Z', ip_address: '192.0.2.1', username: 'fictional', outcome: 'success' }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([event]), { headers: { 'X-Total-Count': '600' } }))
      .mockResolvedValueOnce(new Response('[]', { headers: { 'X-Total-Count': '0' } }))
    const { loadDashboardData, setAccessToken } = await import('../src/api')
    setAccessToken('fake-test-token')
    const data = await loadDashboardData()
    expect(data.source).toBe('api')
    expect(data.eventTotal).toBe(600)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/events?limit=500&order=desc'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fake-test-token' }) }))
  })

  it.each([429, 503])('does not hide HTTP %i behind fictional data', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'Test HTTP error' }), { status }))
    const { loadDashboardData, ApiResponseError } = await import('../src/api')
    await expect(loadDashboardData()).rejects.toBeInstanceOf(ApiResponseError)
  })

  it('requests access on HTTP 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }))
    const { loadDashboardData, UnauthorizedError } = await import('../src/api')
    await expect(loadDashboardData()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('labels network fallback as demo', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Offline'))
    const { loadDashboardData } = await import('../src/api')
    expect((await loadDashboardData()).source).toBe('demo')
  })

  it('keeps assistant requests on the backend in a normal build', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ answer: 'Test backend reply', provider: 'mock' })))
    const { askAssistant } = await import('../src/api')
    expect((await askAssistant('Como investigar?')).provider).toBe('mock')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/assistant'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'Como investigar?' }) }))
  })

  it('keeps the native assistant request contract unchanged when a language argument is supplied', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ answer: 'Backend answer', provider: 'gemini' })))
    const { askAssistant } = await import('../src/api')
    expect((await askAssistant('How do I investigate?', 'en')).provider).toBe('gemini')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/assistant'), expect.objectContaining({ body: JSON.stringify({ message: 'How do I investigate?' }) }))
  })

  it('saves a review through the operator API with the expected revision', async () => {
    const { demoAlerts } = await import('../src/demo-data')
    const { saveAlertReview, setAccessToken } = await import('../src/api')
    const request = { review_status: 'investigating' as const, review_note: 'Rever registos.', expected_revision: 0 }
    const saved = { ...demoAlerts[0], ...request, review_revision: 1 }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(saved)))
    setAccessToken('fake-operator')
    expect((await saveAlertReview(demoAlerts[0], request)).review_revision).toBe(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/alerts/1/review'), expect.objectContaining({
      method: 'POST', body: JSON.stringify(request), headers: expect.objectContaining({ Authorization: 'Bearer fake-operator' }),
    }))
  })

  it.each([409, 429, 503])('does not fake a successful review after HTTP %i', async (status) => {
    const { demoAlerts } = await import('../src/demo-data')
    const { saveAlertReview, ApiResponseError } = await import('../src/api')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'Não guardado.' }), { status }))
    await expect(saveAlertReview(demoAlerts[0], { review_status: 'open', review_note: '', expected_revision: 0 })).rejects.toBeInstanceOf(ApiResponseError)
    expect(demoAlerts[0].review_revision).toBe(0)
  })

  it('does not mark a network failure as saved', async () => {
    const { demoAlerts } = await import('../src/demo-data')
    const { saveAlertReview } = await import('../src/api')
    vi.mocked(fetch).mockRejectedValue(new TypeError('Offline'))
    await expect(saveAlertReview(demoAlerts[0], { review_status: 'open', review_note: '', expected_revision: 0 })).rejects.toThrow('Offline')
  })

  it('requires access to review and keeps a fallback sample local', async () => {
    const { demoAlerts } = await import('../src/demo-data')
    const { saveAlertReview, UnauthorizedError } = await import('../src/api')
    const request = { review_status: 'investigating' as const, review_note: 'Teste', expected_revision: 0 }
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(saveAlertReview(demoAlerts[0], request)).rejects.toBeInstanceOf(UnauthorizedError)
    vi.mocked(fetch).mockClear()
    expect((await saveAlertReview(demoAlerts[0], request, true)).review_status).toBe('investigating')
    expect(fetch).not.toHaveBeenCalled()
  })
})
