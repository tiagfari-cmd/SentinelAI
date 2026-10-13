import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, MessageCircle, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { askAssistant } from './api'
import { isPublicDemo, publicGeminiEnabled } from './deployment'
import { demoReply } from './demo-assistant'
import { askPublicGemini } from './public-chat'

type Message = { from: 'assistant' | 'user'; text: string; provider?: 'mock' | 'gemini' | 'local' | 'error' }

type Language = 'pt' | 'en'

const copy = {
  pt: {
    welcome: 'Olá! Posso explicar o dashboard, a importação local de eventos e a investigação de alertas. Sou um guia de respostas pré-definidas, sem acesso aos teus eventos ou notas. O que queres saber?',
    title: 'Assistente Sentinel', localSubtitle: 'Guia local · sem LLM', geminiSubtitle: 'Gemini opcional · com limites', nativeSubtitle: 'IA opcional · redação de melhor esforço',
    close: 'Fechar chat', conversation: 'Conversa com o assistente', language: 'Idioma do guia',
    localDisclaimer: 'Respostas pré-definidas. As perguntas ficam na memória deste separador e não são enviadas a servidores. Não leio os teus eventos nem notas.',
    geminiDisclaimer: 'Só a pergunta é enviada à Cloudflare e ao Google Gemini, com filtragem de melhor esforço. Não enviamos eventos nem notas. Pode errar; não partilhes dados confidenciais.',
    nativeDisclaimer: 'Se Gemini estiver ativo, a pergunta é enviada após mascarar IPs, emails e credenciais comuns. Não partilhes dados confidenciais.',
    consent: 'Enviar as próximas perguntas ao Gemini', quota: '20 pedidos/dia no total, até 8 por origem de rede e 3/min. Sem histórico enviado. A quota pode esgotar; o guia local continua disponível.', terms: 'Tratamento de dados pelo Google',
    connectionError: 'Erro de ligação', localProvider: 'Resposta local', mockProvider: 'Modo demonstração', waiting: 'A preparar a resposta…',
    inputLabel: 'Mensagem para o assistente', placeholder: 'Como funciona o dashboard?', send: 'Enviar mensagem', launcherClose: 'Fechar', launcherOpen: 'Pergunta ao assistente',
    unknownError: 'Erro desconhecido ao contactar o backend.', errorPrefix: 'Não consegui contactar o assistente:', localFallback: 'Guia local (resposta pré-definida, não gerada por IA):',
    suggestions: ['Como funciona o dashboard?', 'Como importar os meus eventos?', 'Como investigar o alerta?'],
  },
  en: {
    welcome: 'Hi! I can explain the dashboard, local event import and alert investigation. I am a predefined-answer guide without access to your events or notes. What would you like to know?',
    title: 'Sentinel Assistant', localSubtitle: 'Local guide · no LLM', geminiSubtitle: 'Optional Gemini · limited usage', nativeSubtitle: 'Optional AI · best-effort redaction',
    close: 'Close chat', conversation: 'Conversation with the assistant', language: 'Guide language',
    localDisclaimer: 'Predefined answers. Questions stay in this tab’s memory and are not sent to servers. I cannot read your events or notes.',
    geminiDisclaimer: 'Only your question is sent to Cloudflare and Google Gemini, with best-effort filtering. We do not send events or notes. Replies may be wrong; do not share confidential data.',
    nativeDisclaimer: 'If Gemini is enabled, questions are sent after masking common IPs, emails and credentials. Do not share confidential data.',
    consent: 'Send my next questions to Gemini', quota: '20 requests/day in total, up to 8 per network origin and 3/minute. No history is sent. The quota may run out; the local guide remains available.', terms: 'Google data processing',
    connectionError: 'Connection error', localProvider: 'Local answer', mockProvider: 'Demo mode', waiting: 'Preparing an answer…',
    inputLabel: 'Message for the assistant', placeholder: 'How does the dashboard work?', send: 'Send message', launcherClose: 'Close', launcherOpen: 'Ask the assistant',
    unknownError: 'Unknown error contacting the backend.', errorPrefix: 'I could not contact the assistant:', localFallback: 'Local guide (predefined answer, not AI-generated):',
    suggestions: ['How does the dashboard work?', 'How can I import my events?', 'How do I investigate an alert?'],
  },
}

function welcomeFor(language: Language): Message { return { from: 'assistant', text: copy[language].welcome } }

export function Assistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [language, setLanguage] = useState<Language>('pt')
  const [messages, setMessages] = useState<Message[]>([welcomeFor('pt')])
  const [sending, setSending] = useState(false)
  const [useGemini, setUseGemini] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textCopy = copy[language]
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight }) }, [messages, sending])

  function closeChat() {
    setOpen(false)
    launcherRef.current?.focus()
  }

  function changeLanguage(next: Language) {
    setLanguage(next)
    // Do not rewrite the visitor's existing questions or replies.
    setMessages((current) => current.length === 1 ? [welcomeFor(next)] : current)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setMessages((current) => [...current, { from: 'user', text }])
    setInput('')
    setSending(true)
    try {
      const reply = isPublicDemo && publicGeminiEnabled && useGemini ? await askPublicGemini(text) : await askAssistant(text, language)
      setMessages((current) => [...current, { from: 'assistant', text: reply.answer, provider: reply.provider }])
    } catch (error) {
      const detail = error instanceof Error ? error.message : textCopy.unknownError
      setMessages((current) => [...current, { from: 'assistant', text: `${textCopy.errorPrefix} ${detail}\n\n${textCopy.localFallback} ${demoReply(text, language)}`, provider: 'error' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="assistant-root">
      {open && (
        <section className="assistant-panel" lang={language} aria-label={textCopy.title} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeChat() } }}>
          <header className="assistant-header">
            <span className="assistant-icon"><Bot size={18} /></span>
            <div><strong>{textCopy.title}</strong><small>{isPublicDemo ? publicGeminiEnabled && useGemini ? textCopy.geminiSubtitle : textCopy.localSubtitle : textCopy.nativeSubtitle}</small></div>
            <button className="icon-button" type="button" aria-label={textCopy.close} onClick={closeChat}><X size={18} /></button>
          </header>
          {isPublicDemo && <div className="assistant-language"><label htmlFor="assistant-language">{textCopy.language}</label><select id="assistant-language" value={language} disabled={sending} onChange={(event) => changeLanguage(event.target.value as Language)}><option value="pt" lang="pt">Português</option><option value="en" lang="en">English</option></select></div>}
          <div className="assistant-disclaimer">
            <Sparkles size={14} /><span>{isPublicDemo ? publicGeminiEnabled && useGemini ? textCopy.geminiDisclaimer : textCopy.localDisclaimer : textCopy.nativeDisclaimer}</span>
          </div>
          {isPublicDemo && publicGeminiEnabled && <div className="assistant-consent"><label><input type="checkbox" checked={useGemini} disabled={sending} onChange={(event) => setUseGemini(event.target.checked)} />{textCopy.consent}</label><small>{textCopy.quota} <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">{textCopy.terms}</a>.</small></div>}
          <div ref={messagesRef} className="assistant-messages" role="log" aria-label={textCopy.conversation} aria-live="polite" aria-relevant="additions">
            {messages.map((message, index) => (
              <div className={`chat-message ${message.from}`} key={`${index}-${message.from}`}>
                {message.from === 'assistant' && <Bot size={15} />}
                <div><p>{message.text}</p>{message.provider && <small className="chat-provider">{message.provider === 'gemini' ? 'Gemini' : message.provider === 'error' ? textCopy.connectionError : message.provider === 'local' ? textCopy.localProvider : textCopy.mockProvider}</small>}</div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="suggestion-list">{textCopy.suggestions.map((question) => <button key={question} className="suggestion-chip" type="button" onClick={() => { setInput(question); inputRef.current?.focus() }}><ShieldAlert size={14} />{question}</button>)}</div>
            )}
            {sending && <p className="assistant-waiting" role="status">{textCopy.waiting}</p>}
          </div>
          <form className="assistant-form" onSubmit={send}>
            <label className="sr-only" htmlFor="assistant-input">{textCopy.inputLabel}</label>
            <input ref={inputRef} id="assistant-input" value={input} onChange={(event) => setInput(event.target.value)} maxLength={1000} placeholder={textCopy.placeholder} disabled={sending} />
            <button className="send-button" type="submit" aria-label={textCopy.send} disabled={!input.trim() || sending}><Send size={16} /></button>
          </form>
        </section>
      )}
      <button ref={launcherRef} className={`assistant-launcher ${open ? 'active' : ''}`} type="button" aria-expanded={open} onClick={() => { if (open) closeChat(); else setOpen(true) }}>
        {open ? <X size={19} /> : <MessageCircle size={19} />}<span>{open ? textCopy.launcherClose : textCopy.launcherOpen}</span>
      </button>
    </div>
  )
}
