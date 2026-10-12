import { useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, MessageCircle, Send, ShieldAlert, Sparkles, X } from 'lucide-react'

type Message = { from: 'assistant' | 'user'; text: string }

const welcome: Message = {
  from: 'assistant',
  text: 'Olá! Posso ajudar-te a interpretar os dados de demonstração e sugerir próximos passos de investigação.',
}

function mockReply(prompt: string): string {
  const question = prompt.toLowerCase()
  if (question.includes('203.0.113.42') || question.includes('alerta')) {
    return 'Os dados fictícios mostram cinco falhas associadas ao mesmo IP num intervalo curto. Confirma os registos de autenticação na origem, verifica se a utilizadora reconhece a atividade e procura eventos relacionados. É um sinal para investigar, não uma confirmação de ataque.'
  }
  if (question.includes('passo') || question.includes('investig')) {
    return 'Sugestão de investigação: (1) validar os timestamps e a origem dos registos; (2) procurar autenticações bem-sucedidas próximas das falhas; (3) confirmar com a pessoa responsável se reconhece o acesso. Não tomes medidas automáticas só com base neste alerta.'
  }
  return 'Este protótipo só consegue responder com exemplos pré-definidos sobre os dados fictícios apresentados. Quando configurarmos um LLM no backend, poderá resumir evidências reais — sempre separando factos observados de hipóteses.'
}

export function Assistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([welcome])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text) return
    setMessages((current) => [...current, { from: 'user', text }, { from: 'assistant', text: mockReply(text) }])
    setInput('')
  }

  return (
    <div className="assistant-root">
      {open && (
        <section className="assistant-panel" aria-label="Chat de demonstração">
          <header className="assistant-header">
            <span className="assistant-icon"><Bot size={18} /></span>
            <div><strong>Assistente Sentinel</strong><small>Modo demonstração</small></div>
            <button className="icon-button" type="button" aria-label="Fechar chat" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="assistant-disclaimer"><Sparkles size={14} /> Respostas simuladas — sem LLM nem dados em tempo real.</div>
          <div className="assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.from}`} key={`${index}-${message.from}`}>
                {message.from === 'assistant' && <Bot size={15} />}
                <p>{message.text}</p>
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
            <input id="assistant-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pergunta sobre os dados de demonstração…" />
            <button className="send-button" type="submit" aria-label="Enviar mensagem" disabled={!input.trim()}><Send size={16} /></button>
          </form>
        </section>
      )}
      <button className={`assistant-launcher ${open ? 'active' : ''}`} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? <X size={19} /> : <MessageCircle size={19} />}<span>{open ? 'Fechar' : 'Pergunta ao assistente'}</span>
      </button>
    </div>
  )
}
