import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, MessageCircle, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { askAssistant } from './api'
import { isPublicDemo } from './deployment'
import { demoReply } from './demo-assistant'

type Message = { from: 'assistant' | 'user'; text: string; provider?: 'mock' | 'gemini' | 'local' | 'error' }

const welcome: Message = {
  from: 'assistant',
  text: 'Olá! Posso ajudar-te a interpretar os indicadores agregados e sugerir próximos passos de investigação.',
}

export function Assistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([welcome])
  const [sending, setSending] = useState(false)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setMessages((current) => [...current, { from: 'user', text }])
    setInput('')
    setSending(true)
    try {
      const reply = await askAssistant(text)
      setMessages((current) => [...current, { from: 'assistant', text: reply.answer, provider: reply.provider }])
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Erro desconhecido ao contactar o backend.'
      setMessages((current) => [...current, { from: 'assistant', text: `Não consegui contactar o assistente: ${detail}\n\nResposta de demonstração: ${demoReply(text)}`, provider: 'error' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="assistant-root">
      {open && (
        <section className="assistant-panel" aria-label="Chat de demonstração">
          <header className="assistant-header">
            <span className="assistant-icon"><Bot size={18} /></span>
            <div><strong>Assistente Sentinel</strong><small>{isPublicDemo ? 'Respostas locais · sem LLM' : 'IA opcional · redação de melhor esforço'}</small></div>
            <button className="icon-button" type="button" aria-label="Fechar chat" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="assistant-disclaimer">
            <Sparkles size={14} /><span>{isPublicDemo ? 'As perguntas ficam na memória deste separador. Não são enviadas a um servidor. Respostas pré-definidas; não partilhes dados confidenciais.' : 'Se Gemini estiver ativo, a pergunta é enviada após mascarar IPs, emails e credenciais comuns. Não partilhes dados confidenciais.'}</span>
          </div>
          <div className="assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.from}`} key={`${index}-${message.from}`}>
                {message.from === 'assistant' && <Bot size={15} />}
                <div><p>{message.text}</p>{message.provider && <small className="chat-provider">{message.provider === 'gemini' ? 'Gemini' : message.provider === 'error' ? 'Erro de ligação' : message.provider === 'local' ? 'Resposta local' : 'Modo demonstração'}</small>}</div>
              </div>
            ))}
            {messages.length === 1 && (
              <button className="suggestion-chip" type="button" onClick={() => setInput('Como devo investigar o alerta 203.0.113.42?')}>
                <ShieldAlert size={14} /> Como investigar o alerta de autenticação?
              </button>
            )}
          </div>
          <form className="assistant-form" onSubmit={send}>
            <label className="sr-only" htmlFor="assistant-input">Mensagem para o assistente</label>
            <input id="assistant-input" value={input} onChange={(event) => setInput(event.target.value)} maxLength={1000} placeholder="Pergunta sobre os indicadores…" disabled={sending} />
            <button className="send-button" type="submit" aria-label="Enviar mensagem" disabled={!input.trim() || sending}><Send size={16} /></button>
          </form>
        </section>
      )}
      <button className={`assistant-launcher ${open ? 'active' : ''}`} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? <X size={19} /> : <MessageCircle size={19} />}<span>{open ? 'Fechar' : 'Pergunta ao assistente'}</span>
      </button>
    </div>
  )
}
