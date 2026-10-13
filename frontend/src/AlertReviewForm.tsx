import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AlertReviewRequest, SecurityAlert } from './types'
import { reviewLabels } from './alert-review'

export function AlertReviewForm({ alert, simulated, localFile = false, onSave, onReload }: {
  alert: SecurityAlert
  simulated: boolean
  localFile?: boolean
  onSave: (request: AlertReviewRequest) => Promise<void>
  onReload: () => void
}) {
  const [status, setStatus] = useState(alert.review_status)
  const [note, setNote] = useState(alert.review_note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSave({ review_status: status, review_note: note, expected_revision: alert.review_revision })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível guardar.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="review-form" onSubmit={(event) => void submit(event)}>
    <h3>Investigação humana</h3>
    <p>{localFile ? 'Este alerta foi calculado a partir do teu ficheiro. Estado e nota ficam só na memória do browser; exporta a análise para os guardar. Resolver não apaga a evidência.' : simulated ? 'Simulação: estado e nota ficam só neste separador; atualizar dados limpa as alterações.' : 'Estado e nota são guardados na API. Resolver não apaga a evidência nem confirma que houve um ataque.'}</p>
    <label htmlFor="review-status">Estado do alerta</label>
    <select id="review-status" value={status} onChange={(event) => setStatus(event.target.value as SecurityAlert['review_status'])} disabled={busy}>
      {Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <label htmlFor="review-note">Nota de investigação</label>
    <textarea id="review-note" value={note} maxLength={1000} rows={3} required={status === 'resolved'} disabled={busy}
      onChange={(event) => setNote(event.target.value)} placeholder="Regista a conclusão ou o próximo passo, sem passwords ou tokens." />
    <small>Até 1000 caracteres. Notas não são enviadas automaticamente ao Gemini.</small>
    <span className={`review-status ${alert.review_status}`}>{reviewLabels[alert.review_status]} · revisão {alert.review_revision}</span>
    {alert.reviewed_at && <small>Última atualização: {new Date(alert.reviewed_at).toLocaleString('pt-PT')}</small>}
    {alert.review_revision > 0 && <p role="status">{localFile ? 'Alteração mantida na memória do browser, não num servidor.' : simulated ? 'Alteração simulada neste separador.' : 'Esta revisão está guardada na API.'}</p>}
    {error && <div role="alert"><p>{error} Nenhuma alteração foi confirmada nesta página.</p><button className="text-button" type="button" onClick={onReload}>Atualizar detalhes — descarta a nota por guardar</button></div>}
    <button className="button primary" type="submit" disabled={busy || (status === 'resolved' && !note.trim()) || !alert.id}>{busy ? 'A guardar…' : localFile ? 'Guardar neste browser' : simulated ? 'Simular alteração' : 'Guardar investigação'}</button>
  </form>
}
