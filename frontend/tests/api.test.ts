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

  it('does not send a visitor token to any server', async () => {
    const { verifyAccessToken, setAccessToken, loadDashboardData } = await import('../src/api')
    setAccessToken('fake-test-token')
    await expect(verifyAccessToken('fake-test-token')).rejects.toThrow('não aceita tokens')
    await loadDashboardData()
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
})
