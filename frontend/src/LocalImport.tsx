import { useState } from 'react'
import type { FormEvent } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { analyzeLocalJson } from './local-analysis'
import { demoEvents } from './demo-data'
import type { DashboardData } from './types'
import { downloadJson } from './download'

export function LocalImport({ onImport, onReset, hasLocalData }: {
  onImport: (data: DashboardData) => void
  onReset: () => void
  hasLocalData: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true); setError(''); setResult('')
    try {
      if (file.size > 1024 * 1024) throw new Error('O ficheiro excede o limite de 1 MiB.')
      const data = analyzeLocalJson(await file.text())
      onImport(data)
      setResult(`${data.events.length} eventos analisados. ${data.alerts.length} sinais para investigar. Não é uma confirmação de ataque nem garantia de ausência de problemas.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível ler o ficheiro. Os dados anteriores foram mantidos.') }
    finally { setBusy(false) }
  }
  return <section className="local-import panel" aria-labelledby="local-import-title">
    <div><h2 id="local-import-title"><FileJson size={19} /> Analisa os teus próprios logins</h2><p>Escolhe um ficheiro JSON de eventos. A análise fica neste browser: não enviamos registos a servidores ou ao chatbot.</p></div>
    <form onSubmit={(event) => void submit(event)}>
      <label htmlFor="local-json">Ficheiro de eventos JSON <small>Até 1 MiB · 5000 eventos</small></label>
      <input id="local-json" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError('') }} />
      <div className="local-import-actions"><button className="button primary" type="submit" disabled={!file || busy}><Upload size={15} />{busy ? 'A analisar…' : 'Analisar ficheiro'}</button><button className="button secondary" type="button" disabled={busy} onClick={() => downloadJson('sentinelai-exemplo-ficticio.json', demoEvents)}>Descarregar exemplo</button>{hasLocalData && <button className="button secondary" type="button" disabled={busy} onClick={() => { onReset(); setFile(null); setResult(''); setError(''); const input = document.getElementById('local-json') as HTMLInputElement | null; if (input) input.value = '' }}>Limpar dados locais</button>}</div>
    </form>
    {error && <p className="import-error" role="alert">{error} A análise anterior não foi substituída.</p>}
    {result && hasLocalData && <p className="import-success" role="status">{result}</p>}
    <details><summary>Que formato é necessário?</summary><p>Uma lista de eventos com <code>timestamp</code> (ISO 8601 com fuso horário), <code>ip_address</code>, <code>username</code> e <code>outcome</code> (<code>failed</code> ou <code>success</code>). Não incluas passwords, tokens ou campos extra. Quem gere a aplicação precisa de exportar estes dados; este site não acede à tua empresa.</p><pre>{`[{"timestamp":"2026-10-13T12:00:00Z","ip_address":"192.0.2.1","username":"exemplo","outcome":"failed"}]`}</pre><p>Regra: 5 falhas do mesmo IP em 60 segundos. Uma análise de ficheiro não é monitorização contínua. Os dados e notas desaparecem ao limpar ou recarregar a página; exporta a análise se precisares de a guardar.</p></details>
  </section>
}
