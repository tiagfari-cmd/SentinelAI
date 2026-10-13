import { describe, expect, it, vi } from 'vitest'
import worker, { ChatQuota, handleChat, LIMITS, redact, reserve } from '../worker/chat.mjs'

const origin = 'https://example.test'
const question = 'Como funciona o dashboard?'
function req(body = { message: question, consent: true }, headers = {}) {
  return new Request(`${origin}/chat`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.9', ...headers }, body: JSON.stringify(body) })
}
function setup() {
  let state
  const quota = vi.fn(async (_url, init) => {
    const { client } = JSON.parse(init.body)
    const result = reserve(state, client, Date.now())
    if (result.allowed) state = result.state
    return Response.json({ allowed: result.allowed, retry: result.retry })
  })
  const env = { APP_ORIGIN: origin, CHAT_ENABLED: 'true', GEMINI_PUBLIC_TERMS_CONFIRMED: 'true', GEMINI_API_KEY: 'fictional-server-key', CHAT_QUOTA: { idFromName: (name) => name, get: () => ({ fetch: quota }) } }
  const upstream = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'Resposta educativa de teste.' }] } }] }))
  return { env, upstream, quota }
}

describe('public proxy security contract', () => {
  it('fails closed without enablement, server key, quota or trusted IP', async () => {
    for (const missing of ['CHAT_ENABLED', 'GEMINI_PUBLIC_TERMS_CONFIRMED', 'GEMINI_API_KEY', 'CHAT_QUOTA']) {
      const { env, upstream, quota } = setup(); delete env[missing]
      expect((await handleChat(req(), env, upstream)).status).toBe(503)
      expect(upstream).not.toHaveBeenCalled(); expect(quota).not.toHaveBeenCalled()
    }
    const { env, upstream } = setup(); const request = req(); request.headers.delete('CF-Connecting-IP')
    expect((await handleChat(request, env, upstream)).status).toBe(503)
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each([{ message: question }, { message: question, consent: false }, { message: ' ', consent: true }, { message: 'x'.repeat(1001), consent: true }, { message: question, consent: true, events: [] }, { message: question, consent: true, notes: 'private' }, [], null])('rejects missing consent or invalid/extra data', async (body) => {
    const { env, upstream, quota } = setup()
    expect((await handleChat(req(body), env, upstream)).status).toBe(422)
    expect(upstream).not.toHaveBeenCalled(); expect(quota).not.toHaveBeenCalled()
  })
  it('checks origin, JSON content type, method and both streamed/declared size', async () => {
    const { env, upstream } = setup()
    expect((await handleChat(req(undefined, { Origin: 'https://other.test' }), env, upstream)).status).toBe(403)
    expect((await handleChat(req(undefined, { 'Content-Type': 'text/plain' }), env, upstream)).status).toBe(415)
    expect((await handleChat(new Request(`${origin}/chat`), env, upstream)).status).toBe(405)
    expect((await handleChat(req({ message: 'x'.repeat(9000), consent: true }), env, upstream)).status).toBe(413)
    expect((await handleChat(req(undefined, { 'Content-Length': '9000' }), env, upstream)).status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('redacts common identifiers/credentials and sends only this question (never IP or notes)', async () => {
    const { env, upstream, quota } = setup()
    const result = await handleChat(req({ message: 'IP 192.0.2.9 e 2001:db8::1, a@example.test token=fictional-secret Bearer fictional-auth', consent: true }), env, upstream)
    expect(result.status).toBe(200)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toMatch(/gemini-3\.5-flash-lite:generateContent$/)
    expect(url).not.toContain(env.GEMINI_API_KEY)
    expect(init.headers['x-goog-api-key']).toBe(env.GEMINI_API_KEY)
    expect(init.redirect).toBe('error')
    const payload = JSON.parse(init.body)
    expect(payload.contents).toHaveLength(1)
    expect(payload.contents[0].parts[0].text).not.toMatch(/192\.0\.2\.9|2001:db8|a@example|fictional-secret|fictional-auth/)
    expect(payload.generationConfig.maxOutputTokens).toBe(384)
    expect(quota.mock.calls[0][1].body).not.toContain('192.0.2.9')
    expect((await result.json()).provider).toBe('gemini')
  })
  it.each([400, 403, 404, 429, 500])('does not expose upstream error details or retry HTTP %i', async (status) => {
    const { env, upstream } = setup()
    upstream.mockImplementation(async () => new Response('sensitive-upstream-key', { status }))
    const response = await handleChat(req(), env, upstream)
    expect(response.status).toBe(status === 429 ? 429 : 502)
    expect(await response.text()).not.toContain('sensitive-upstream-key')
    expect(upstream).toHaveBeenCalledOnce()
  })
  it('quota storage failure cannot bypass caps', async () => {
    const { env, upstream, quota } = setup(); quota.mockRejectedValue(new Error('storage'))
    expect((await handleChat(req(), env, upstream)).status).toBe(503)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('counts failed attempts and prevents the fourth call within a minute', async () => {
    const { env, upstream } = setup(); upstream.mockRejectedValue(new Error('secret-error'))
    for (let i = 0; i < 3; i++) expect((await handleChat(req(), env, upstream)).status).toBe(503)
    const last = await handleChat(req(), env, upstream)
    expect(last.status).toBe(429); expect(Number(last.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(upstream).toHaveBeenCalledTimes(3)
  })
  it('no output/oversized upstream response fails honestly', async () => {
    const { env, upstream } = setup()
    upstream.mockImplementationOnce(async () => Response.json({ candidates: [] }))
      .mockImplementationOnce(async () => new Response('x'.repeat(65537)))
    expect((await handleChat(req(), env, upstream)).status).toBe(503)
    expect((await handleChat(req(), env, upstream)).status).toBe(503)
  })
  it('routes assets but never exposes monitoring API paths', async () => {
    const assets = vi.fn(async () => new Response('asset'))
    expect(await (await worker.fetch(new Request(`${origin}/`), { ASSETS: { fetch: assets } })).text()).toBe('asset')
    for (const path of ['/api', '/api/events', '/events', '/alerts/1/review', '/assistant', '/auth/check', '/chat/']) expect((await worker.fetch(new Request(`${origin}${path}`), {})).status).toBe(404)
    expect(assets).toHaveBeenCalledOnce()
  })
})

describe('durable daily budget', () => {
  it('bounds total attempts to 20 across distinct clients, without mutating input', () => {
    let state; const now = Date.parse('2026-10-13T12:00:00Z')
    for (let i = 0; i < LIMITS.daily; i++) { const previous = state; const result = reserve(state, String(i), now); expect(result.allowed).toBe(true); state = result.state; if (previous) expect(previous.total).toBe(i) }
    expect(reserve(state, 'new-client', now).allowed).toBe(false)
    expect(Object.keys(state.clients)).toHaveLength(20)
  })
  it('limits a client to eight per day and resets at midnight UTC', () => {
    let state; const now = Date.parse('2026-10-13T12:00:00Z')
    for (let i = 0; i < 8; i++) state = reserve(state, 'client', now + i * 61000).state
    expect(reserve(state, 'client', now + 8 * 61000).allowed).toBe(false)
    const tomorrow = reserve(state, 'client', Date.parse('2026-10-14T00:00:00Z'))
    expect(tomorrow.allowed).toBe(true); expect(tomorrow.state.total).toBe(1)
  })
  it('serializes concurrent reservations in the storage transaction and survives new object instance', async () => {
    let budget; let queue = Promise.resolve()
    const ctx = { storage: { transaction: (fn) => {
      const next = queue.then(() => fn({ get: async () => structuredClone(budget), put: async (_key, value) => { budget = structuredClone(value) } }))
      queue = next.then(() => undefined); return next
    } } }
    const quota = new ChatQuota(ctx)
    const replies = await Promise.all(Array.from({ length: 25 }, (_, i) => quota.fetch(new Request('https://internal/', { method: 'POST', body: JSON.stringify({ client: i.toString(16).padStart(64, '0') }) }))))
    const allowed = await Promise.all(replies.map((reply) => reply.json()))
    expect(allowed.filter((reply) => reply.allowed)).toHaveLength(20)
    const restarted = new ChatQuota(ctx)
    expect((await (await restarted.fetch(new Request('https://internal/', { method: 'POST', body: JSON.stringify({ client: 'f'.repeat(64) }) }))).json()).allowed).toBe(false)
    expect(budget.total).toBe(20)
  })
  it('rejects forged identifiers before accessing storage', async () => {
    const transaction = vi.fn(); const quota = new ChatQuota({ storage: { transaction } })
    expect((await quota.fetch(new Request('https://internal', { method: 'POST', body: JSON.stringify({ client: '__proto__' }) }))).status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
  })
  it('redaction handles a Gemini-style key', () => expect(redact(`AIza${'a'.repeat(35)}`)).toBe('[chave redigida]'))
})
