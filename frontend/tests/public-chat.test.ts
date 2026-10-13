import { afterEach, describe, expect, it, vi } from 'vitest'
import { askPublicGemini } from '../src/public-chat'

afterEach(() => vi.unstubAllGlobals())
describe('public Gemini transport', () => {
  it('sends only explicit question and consent to same origin; no cookies, token or history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: 'Resposta de teste.', provider: 'gemini' }))))
    expect((await askPublicGemini('Como funciona?')).provider).toBe('gemini')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith('/chat', expect.objectContaining({ credentials: 'omit', body: JSON.stringify({ message: 'Como funciona?', consent: true }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }))
  })
  it.each([429, 502, 503])('reports HTTP %i without retries or pretending a local reply is Gemini', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Usa o guia local.' }), { status })))
    await expect(askPublicGemini('Pergunta')).rejects.toThrow('guia local')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each([{ answer: 'Resposta', provider: 'local' }, { answer: '', provider: 'gemini' }, {}])('rejects invalid success payload', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
    await expect(askPublicGemini('Pergunta')).rejects.toThrow('inválida')
  })
})
