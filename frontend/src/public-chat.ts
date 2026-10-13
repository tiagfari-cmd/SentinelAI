// Explicit opt-in. No history, token, dashboard state, events or notes are sent.
export async function askPublicGemini(message: string): Promise<{ answer: string; provider: 'gemini' }> {
  const response = await fetch('/chat', {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message, consent: true }), signal: AbortSignal.timeout(25000),
  })
  const body = await response.json().catch(() => null) as { detail?: unknown; answer?: unknown; provider?: unknown } | null
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `Não foi possível obter uma resposta (HTTP ${response.status}).`)
  if (body?.provider !== 'gemini' || typeof body.answer !== 'string' || !body.answer.trim()) throw new Error('Resposta inválida do assistente.')
  return { answer: body.answer, provider: 'gemini' }
}
