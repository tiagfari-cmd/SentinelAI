import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ShieldAlert, X } from 'lucide-react'
import { AlertReviewForm } from './AlertReviewForm'
import type { AlertReviewRequest, SecurityAlert } from './types'

const formatDate = (value: string) => new Date(value).toLocaleString('pt-PT')

export function AlertDialog({ alert, simulated, localFile = false, onClose, onSave, onReload }: {
  alert: SecurityAlert
  simulated: boolean
  localFile?: boolean
  onClose: () => void
  onSave: (request: AlertReviewRequest) => Promise<void>
  onReload: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      else document.getElementById('main-content')?.focus()
    }
  }, [])

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab' || !panel.current) return
    const controls = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')]
      .filter((element) => element.getClientRects().length > 0)
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return <div className="modal-scrim" onKeyDown={handleKeys} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panel} className="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
      <header><span className="alert-icon high"><ShieldAlert size={20} /></span><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={20} /></button></header>
      <div className="eyebrow"><span /> SINAL PARA INVESTIGAR</div>
      <h2 id="alert-dialog-title">Várias falhas de login</h2>
      <p id="alert-dialog-description" className="dialog-description">{alert.message}</p>
      <dl className="evidence-grid">
        <div><dt>Endereço IP</dt><dd>{alert.ip_address}</dd></div><div><dt>Falhas observadas</dt><dd>{alert.failure_count}</dd></div>
        <div><dt>Primeira falha</dt><dd>{formatDate(alert.first_failure)}</dd></div><div><dt>Última falha</dt><dd>{formatDate(alert.last_failure)}</dd></div>
        <div><dt>Utilizadores associados</dt><dd>{alert.usernames.join(', ')}</dd></div><div><dt>Alerta criado</dt><dd>{formatDate(alert.detected_at)}</dd></div>
      </dl>
      <div className="investigation-note"><strong>Por onde começar?</strong><p>Confirma os registos na aplicação e verifica com a pessoa responsável se reconhece estes acessos. Um alerta não confirma um ataque.</p></div>
      <AlertReviewForm alert={alert} simulated={simulated} localFile={localFile} onSave={onSave} onReload={onReload} />
      <button className="button secondary dialog-close" onClick={onClose}>Fechar detalhes <Check size={16} /></button>
    </section>
  </div>
}
