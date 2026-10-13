import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check, KeyRound,
  ChevronRight, CircleHelp, Clock3, Download, LayoutDashboard, Menu,
  RefreshCw, Search, Server, Shield, ShieldAlert, Users,
} from 'lucide-react'
import { Assistant } from './Assistant'
import { loadDashboardData, saveAlertReview, setAccessToken, UnauthorizedError, verifyAccessToken } from './api'
import { AlertDialog } from './AlertDialog'
import { matchesAlertFilter, reviewLabels } from './alert-review'
import type { AlertFilter } from './alert-review'
import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'
import { isPublicDemo } from './deployment'
import { LocalImport } from './LocalImport'
import { downloadJson } from './download'
import { demoData } from './demo-data'
import { compareTimestamps } from './activity'
import './App.css'

const ActivityChart = lazy(() => import('./ActivityChart'))

type Section = 'overview' | 'alerts' | 'events'
type EventFilter = 'all' | 'failed' | 'success'

const emptyData: DashboardData = { events: [], alerts: [], source: 'api' }

const dateFormatter = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })
function formatDate(value: string) { return dateFormatter.format(new Date(value)) }

function keepNewerReviews(current: DashboardData, updated: DashboardData): DashboardData {
  if (current.source !== 'api' || updated.source !== 'api') return updated
  const existing = new Map(current.alerts.map((alert) => [alert.id, alert]))
  return { ...updated, alerts: updated.alerts.map((alert) => { const previous = existing.get(alert.id); return previous && previous.review_revision > alert.review_revision ? previous : alert }) }
}

function alertPriority(alert: SecurityAlert) {
  return alert.failure_count >= 10 ? 'critical' : 'high'
}

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [query, setQuery] = useState('')
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('active')
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [accessRequired, setAccessRequired] = useState(false)
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [checkingAccess, setCheckingAccess] = useState(false)
  const refreshGeneration = useRef(0)

  async function refresh() {
    if (data.source === 'local') {
      setSelectedAlert((current) => current ? data.alerts.find((alert) => alert.id === current.id) ?? null : null)
      return
    }
    setLoading(true)
    const generation = ++refreshGeneration.current
    try {
      const updated = await loadDashboardData()
      if (generation !== refreshGeneration.current) return
      if (updated.source === 'demo' && data.source === 'api') throw new Error('API indisponível. Mantivemos os últimos dados carregados.')
      setData((current) => keepNewerReviews(current, updated))
      setSelectedAlert((current) => { const next = current ? updated.alerts.find((alert) => alert.id === current.id) : null; return current && next && current.review_revision > next.review_revision ? current : next ?? null })
      setDataError('')
    } catch (error) {
      if (generation !== refreshGeneration.current) return
      if (error instanceof UnauthorizedError) {
        setAccessToken('')
        setAccessRequired(true)
      } else {
        setDataError(error instanceof Error ? error.message : 'Não foi possível carregar os dados.')
      }
    } finally {
      if (generation === refreshGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadDashboardData()
      .then((initialData) => { if (active) setData(initialData) })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof UnauthorizedError) setAccessRequired(true)
        else setDataError(error instanceof Error ? error.message : 'Não foi possível carregar os dados.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const candidate = accessInput.trim()
    if (!candidate || checkingAccess) return
    setCheckingAccess(true)
    setAccessError('')
    try {
      await verifyAccessToken(candidate)
      setAccessToken(candidate)
      setData(await loadDashboardData())
      setDataError('')
      setAccessInput('')
      setAccessRequired(false)
      setSelectedAlert(null)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Não foi possível validar o acesso.')
    } finally {
      setCheckingAccess(false)
    }
  }

  const filteredEvents = useMemo(() => data.events
    .filter((event) => eventFilter === 'all' || event.outcome === eventFilter)
    .filter((event) => `${event.ip_address} ${event.username} ${event.outcome}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => compareTimestamps(b.timestamp, a.timestamp)), [data.events, eventFilter, query])

  const filteredAlerts = useMemo(() => data.alerts
    .filter((alert) => matchesAlertFilter(alert, alertFilter))
    .filter((alert) => `${alert.ip_address} ${alert.usernames.join(' ')} ${alert.message}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => compareTimestamps(b.last_failure, a.last_failure)), [data.alerts, query, alertFilter])

  const failedCount = data.events.filter((event) => event.outcome === 'failed').length
  const successCount = data.events.length - failedCount
  const monitoredIps = new Set(data.events.map((event) => event.ip_address)).size
  const activeAlerts = data.alerts.filter((alert) => alert.review_status !== 'resolved')
  const criticalAlerts = activeAlerts.filter((alert) => alertPriority(alert) === 'critical').length
  const alertShare = activeAlerts.length ? 100 : 0
  const criticalShare = activeAlerts.length ? (criticalAlerts / activeAlerts.length) * 100 : 0

  if (accessRequired) {
    return <AccessGate value={accessInput} onChange={setAccessInput} onSubmit={unlock} error={accessError} busy={checkingAccess} />
  }

  function exportEvents() {
    downloadJson('sentinelai-events.json', filteredEvents)
  }

  function replaceData(updated: DashboardData) {
    setData(updated); setSelectedAlert(null); setQuery(''); setEventFilter('all'); setAlertFilter('active'); setDataError(''); setSection('overview')
  }

  function exportAnalysis() {
    downloadJson('sentinelai-analise.json', {
      format: 'sentinelai-local-analysis-v1', source: data.source === 'local' ? 'local-file' : 'fictional-demo',
      created_at: new Date().toISOString(), rule: { failure_threshold: 5, window_seconds: 60 },
      counts: { events: data.events.length, failed: failedCount, success: successCount, distinct_ips: monitoredIps, pending_alerts: activeAlerts.length, alerts: data.alerts.length },
      alerts: data.alerts, limitation: 'Análise de ficheiro, não monitorização contínua. Um alerta não confirma um ataque; ausência de alertas não prova segurança.',
    })
  }

  const nav = (
    <>
      <div className="nav-label">Monitorização</div>
      <button className={`nav-link ${section === 'overview' ? 'selected' : ''}`} onClick={() => { setSection('overview'); setMobileNavOpen(false) }}><LayoutDashboard size={17} /> Visão geral</button>
      <button className={`nav-link ${section === 'alerts' ? 'selected' : ''}`} onClick={() => { setSection('alerts'); setMobileNavOpen(false) }}><ShieldAlert size={17} /> Alertas <span className="nav-count">{activeAlerts.length}</span></button>
      <button className={`nav-link ${section === 'events' ? 'selected' : ''}`} onClick={() => { setSection('events'); setMobileNavOpen(false) }}><Activity size={17} /> Eventos</button>
    </>
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar para o conteúdo</a>
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Shield size={19} /></span><span>Sentinel<span className="brand-accent">AI</span></span></div>
        <div className="workspace-card"><div className="workspace-icon"><Server size={17} /></div><div><strong>{isPublicDemo ? 'Análise no browser' : 'Ambiente local'}</strong><small>Monitorização educativa</small></div><span className="live-dot" /></div>
        <nav aria-label="Navegação principal">{nav}</nav>
        <div className="sidebar-bottom"><div className="simulated-mark"><Activity size={18} /><span>{data.source === 'api' ? 'Dados da tua instalação' : data.source === 'local' ? 'Dados do teu ficheiro' : 'Dados de demonstração'}</span></div><p>{data.source === 'api' ? 'Eventos recebidos pela API' : data.source === 'local' ? 'Só na memória deste browser' : 'Não ligado a sistemas reais'}</p><div className="profile"><span className="avatar">SA</span><div><strong>{data.source === 'api' ? 'Operador SentinelAI' : data.source === 'local' ? 'Análise privada local' : 'Analista de demonstração'}</strong><small>{data.source === 'demo' ? 'Perfil fictício' : 'Sem contas individuais'}</small></div></div></div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="Fechar navegação" onClick={() => setMobileNavOpen(false)} />}

      <main id="main-content" tabIndex={-1} className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Abrir navegação" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><Shield size={15} /><span>Workspace</span><ChevronRight size={14} /><strong>{section === 'overview' ? 'Visão geral' : section === 'alerts' ? 'Alertas' : 'Eventos'}</strong></div>
          <div className="top-actions"><span className={`connection-pill ${dataError ? 'demo' : data.source}`}><i />{dataError ? 'Erro na API' : data.source === 'api' ? 'API ligada' : data.source === 'local' ? 'Ficheiro próprio · só local' : 'Demo · dados fictícios'}</span><button className="icon-button" disabled={data.source === 'local'} title={data.source === 'local' ? 'O ficheiro não se atualiza automaticamente.' : 'Atualizar dados'} onClick={() => void refresh()} aria-label="Atualizar dados"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button><button className="icon-button notification-button" aria-label="Ver alertas pendentes" onClick={() => { setAlertFilter('active'); setSection('alerts') }}><Bell size={17} />{activeAlerts.length > 0 && <i />}</button><span className="top-avatar">SA</span></div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div><div className="eyebrow"><span /> SEGURANÇA DOS ACESSOS</div><h1>{section === 'overview' ? 'Visão geral' : section === 'alerts' ? 'Alertas de segurança' : 'Histórico de eventos'}</h1><p>Vê as tentativas de login e acompanha os sinais que precisam de atenção.</p></div>
            <div className="heading-actions"><label className="search-box"><Search size={16} /><span className="sr-only">Pesquisar IP ou utilizador</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar IP ou utilizador" /></label><button className="button secondary" onClick={exportEvents}><Download size={15} /> Exportar eventos</button></div>
          </div>

          {data.source === 'demo' && <div className="demo-banner"><CircleHelp size={16} /><span>{isPublicDemo ? 'Demo interativa gratuita: dados fictícios, sem recolha de logs e sem ligação à API ou ao Gemini. Pesquisa, explora os alertas e experimenta o assistente local.' : 'Estás a ver dados fictícios. Inicia a API local para carregar eventos guardados na base de dados.'}</span></div>}
          {isPublicDemo && <LocalImport hasLocalData={data.source === 'local'} onImport={replaceData} onReset={() => replaceData({ ...structuredClone(demoData), source: 'demo' })} />}
          {data.source === 'local' && <div className="demo-banner neutral"><Shield size={16} /><span>Estes são os eventos do ficheiro escolhido, não a amostra fictícia. Não saem deste browser. Notas são locais e não ficam guardadas após recarregar. O chatbot não lê os eventos.</span></div>}
          {isPublicDemo && <section className="public-demo-info" aria-label="Usar o SentinelAI"><div><strong>Queres monitorização contínua?</strong><p>Aqui podes analisar um ficheiro; para receber novos logins automaticamente, instala o projeto num ambiente privado e liga-o à tua aplicação. Não é um SaaS empresarial.</p></div><a className="button secondary" href="https://github.com/tiagfari-cmd/SentinelAI#executar-com-docker-compose" target="_blank" rel="noopener noreferrer">Código e instalação <ArrowUpRight size={15} /></a></section>}
          {data.source === 'local' && <div className="local-report-actions"><p>Guarda um relatório JSON com os indicadores, todos os alertas e as notas locais. A exportação de eventos acima respeita os filtros.</p><button className="button secondary" onClick={exportAnalysis}>Exportar análise <Download size={15} /></button></div>}
          {dataError && <div className="demo-banner" role="alert"><AlertTriangle size={16} /><span>{dataError} Os dados abaixo podem estar desatualizados; não foram substituídos por uma amostra fictícia.</span></div>}
          {data.source === 'api' && ((data.eventTotal ?? data.events.length) > data.events.length || (data.alertTotal ?? data.alerts.length) > data.alerts.length) && <div className="demo-banner neutral"><CircleHelp size={16} /><span>Vista limitada aos registos mais recentes: {data.events.length} de {data.eventTotal} eventos e {data.alerts.length} de {data.alertTotal} alertas. Indicadores, pesquisa e exportação referem-se apenas aos dados carregados. Usa a paginação da API para consultar o restante histórico.</span></div>}
          {!dataError && data.source === 'api' && data.events.length === 0 && <div className="demo-banner neutral"><Check size={16} /><span>API ligada. Ainda não existem eventos guardados. Envia um evento em <code>POST /events</code> para começar.</span></div>}

          {section === 'overview' && (
            <>
              <section className="stats-grid" aria-label="Estatísticas">
                <StatCard icon={<Activity size={19} />} label="Tentativas de login" value={data.events.length.toLocaleString('pt-PT')} note={data.source === 'demo' ? 'amostra fictícia' : 'nos dados carregados'} tone="mint" />
                <StatCard icon={<AlertTriangle size={19} />} label="Alertas pendentes" value={activeAlerts.length.toLocaleString('pt-PT')} note="por tratar ou em análise" tone="red" />
                <StatCard icon={<Check size={19} />} label="Logins com sucesso" value={successCount.toLocaleString('pt-PT')} note="nos dados carregados" tone="mint" />
                <StatCard icon={<Users size={19} />} label="Origens de acesso" value={monitoredIps.toLocaleString('pt-PT')} note="endereços IP distintos" tone="blue" />
              </section>

              <section className="visual-grid">
                <div className="panel activity-panel"><div className="panel-heading"><div><h2><Activity size={17} /> Atividade de autenticação</h2><p>Eventos recebidos, agrupados por hora</p></div><span className="range-label"><Clock3 size={14} /> Período disponível</span></div><div className="chart-summary"><strong>{data.events.length.toLocaleString('pt-PT')}</strong><span>eventos</span><em><ArrowUpRight size={14} /> {failedCount} falhas</em></div><div className="chart-wrap">{data.events.length ? <Suspense fallback={<EmptyState text="A preparar o gráfico…" />}><ActivityChart events={data.events} /></Suspense> : <EmptyState text="Ainda não há eventos suficientes para desenhar o gráfico." />}</div><div className="chart-legend"><span><i className="mint-dot" /> Sucesso ({successCount})</span><span><i className="red-dot" /> Falha ({failedCount})</span></div></div>
                <div className="panel breakdown-panel"><div className="panel-heading"><div><h2><ShieldAlert size={17} /> O que precisa de atenção</h2><p>Alertas ainda não resolvidos</p></div></div><div className="alert-total"><div className="donut" style={{ '--critical-share': `${criticalShare}%`, '--alert-share': `${alertShare}%` } as CSSProperties}><strong>{activeAlerts.length}</strong><span>pendentes</span></div></div><div className="severity-legend"><div><span><i className="red-dot" />Prioridade crítica*</span><b>{criticalAlerts}</b></div><div><span><i className="orange-dot" />Prioridade elevada*</span><b>{activeAlerts.filter((alert) => alertPriority(alert) === 'high').length}</b></div></div><p className="severity-footnote">{data.alerts.length - activeAlerts.length} resolvidos no histórico carregado. * A prioridade é um indicador visual, não uma confirmação de ataque.</p></div>
              </section>

              <section className="panel list-panel"><div className="panel-heading list-heading"><div><h2><ShieldAlert size={17} /> Alertas recentes <span className="count-tag">{filteredAlerts.length}</span></h2><p>Sequências detetadas pela regra de autenticação</p></div><button className="text-button" onClick={() => setSection('alerts')}>Ver todos <ArrowUpRight size={14} /></button></div>{filteredAlerts.length ? filteredAlerts.slice(0, 4).map((alert, index) => <AlertRow key={`${alert.ip_address}-${alert.first_failure}-${index}`} alert={alert} onClick={() => setSelectedAlert(alert)} />) : <EmptyState text="Sem alertas para mostrar." />}</section>
              <EventsTable events={filteredEvents.slice(0, 5)} onViewAll={() => setSection('events')} />
            </>
          )}

          {section === 'alerts' && <section className="panel list-panel full-list"><div className="panel-heading list-heading"><div><h2><ShieldAlert size={17} /> Alertas <span className="count-tag">{filteredAlerts.length}</span></h2><p>Abre um alerta, investiga e regista a tua conclusão.</p></div><select className="alert-filter" aria-label="Filtrar alertas por estado" value={alertFilter} onChange={(event) => setAlertFilter(event.target.value as AlertFilter)}><option value="active">Pendentes</option><option value="all">Todos</option><option value="open">Por tratar</option><option value="investigating">Em análise</option><option value="resolved">Resolvidos</option></select></div>{filteredAlerts.length ? filteredAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} onClick={() => setSelectedAlert(alert)} />) : <EmptyState text="Sem alertas neste filtro. Escolhe ‘Todos’ para consultar o histórico." />}</section>}

          {section === 'events' && <section className="panel events-panel"><div className="panel-heading events-heading"><div><h2><Activity size={17} /> Eventos de autenticação <span className="count-tag">{filteredEvents.length}</span></h2><p>{data.source === 'local' ? 'Eventos validados do ficheiro escolhido.' : 'Registos carregados da API ou dados de demonstração.'}</p></div><select aria-label="Filtrar eventos por resultado" value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)}><option value="all">Todos os resultados</option><option value="failed">Falhas</option><option value="success">Sucessos</option></select></div><EventsTable events={filteredEvents} /></section>}

          <footer className="page-footer"><span><i /> Deteção determinística · sem classificação automática de ataques</span><span>SentinelAI · protótipo educativo</span></footer>
        </div>
      </main>

      {selectedAlert && <AlertDialog key={`${selectedAlert.id}:${selectedAlert.review_revision}`} alert={selectedAlert} simulated={data.source !== 'api'} localFile={data.source === 'local'} onClose={() => setSelectedAlert(null)} onReload={() => void refresh()} onSave={async (request) => {
        const source = data.source
        try {
          const saved = await saveAlertReview(selectedAlert, request, source !== 'api')
          setData((current) => current.source === source ? { ...current, alerts: current.alerts.map((alert) => alert.id === saved.id && alert.review_revision <= saved.review_revision ? saved : alert) } : current)
          setSelectedAlert((current) => current?.id === saved.id && current.review_revision <= saved.review_revision ? saved : current)
        } catch (failure) {
          if (failure instanceof UnauthorizedError) { setAccessToken(''); setAccessRequired(true) }
          throw failure
        }
      }} />}
      <Assistant />
    </div>
  )
}

function StatCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className={`stat-card ${tone}`}><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></article>
}

function AlertRow({ alert, onClick }: { alert: SecurityAlert; onClick: () => void }) {
  const priority = alertPriority(alert)
  return <button className="alert-row" onClick={onClick}><span className={`alert-icon ${priority}`}><ShieldAlert size={18} /></span><span className="alert-title"><strong>Várias falhas de login</strong><small>{alert.ip_address} · {alert.usernames.join(', ')}</small><span className={`review-status ${alert.review_status}`}>{reviewLabels[alert.review_status]}</span></span><span className={`priority-pill ${priority}`}>{priority === 'critical' ? 'Crítica*' : 'Elevada*'}</span><span className="alert-count">{alert.failure_count} falhas</span><span className="alert-time">{formatDate(alert.last_failure)}</span><ChevronRight className="row-chevron" size={16} /></button>
}

function EventsTable({ events, onViewAll }: { events: AuthenticationEvent[]; onViewAll?: () => void }) {
  const [requestedPage, setRequestedPage] = useState(1)
  const pageSize = 100
  const pageCount = Math.max(1, Math.ceil(events.length / pageSize))
  // Clamp the visible page immediately when filtering/importing reduces the list.
  const page = Math.min(requestedPage, pageCount)
  const firstIndex = (page - 1) * pageSize
  const visibleEvents = events.slice(firstIndex, firstIndex + pageSize)
  return <section className="panel events-panel">
    <div className="panel-heading events-heading"><div><h2><Activity size={17} /> Eventos recentes <span className="count-tag">{events.length}</span></h2><p>Atividade de autenticação observada</p></div>{onViewAll && <button className="text-button" onClick={onViewAll}>Ver histórico <ArrowUpRight size={14} /></button>}</div>
    {events.length ? <>
      <div className="table-scroll"><table id="events-data-table"><caption className="sr-only">Eventos de autenticação: {firstIndex + 1}–{firstIndex + visibleEvents.length} de {events.length}</caption><thead><tr><th scope="col">Data e hora</th><th scope="col">Endereço IP</th><th scope="col">Utilizador</th><th scope="col">Resultado</th></tr></thead><tbody>{visibleEvents.map((event, index) => <tr key={`${event.timestamp}-${event.ip_address}-${firstIndex + index}`}><td><span className="event-clock"><Clock3 size={14} />{formatDate(event.timestamp)}</span></td><td><code>{event.ip_address}</code></td><td>{event.username}</td><td><span className={`result-pill ${event.outcome}`}><i />{event.outcome === 'failed' ? 'Falha' : 'Sucesso'}</span></td></tr>)}</tbody></table></div>
      {!onViewAll && <nav className="panel-heading events-heading" aria-label="Paginação de eventos" style={{ flexWrap: 'wrap', gap: 12 }}>
        <p role="status" aria-live="polite">{firstIndex + 1}–{firstIndex + visibleEvents.length} de {events.length} eventos · Página {page} de {pageCount}</p>
        {pageCount > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="button secondary" type="button" aria-label="Página anterior de eventos" aria-controls="events-data-table" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>Anterior</button>
          <button className="button secondary" type="button" aria-label="Página seguinte de eventos" aria-controls="events-data-table" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Seguinte</button>
        </div>}
      </nav>}
    </> : <EmptyState text="Não há eventos para mostrar neste filtro." />}
  </section>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span><ArrowDownRight size={18} /></span><p>{text}</p></div>
}

function AccessGate({ value, onChange, onSubmit, error, busy }: {
  value: string
  onChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  error: string
  busy: boolean
}) {
  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={onSubmit}>
        <span className="access-mark"><KeyRound size={20} /></span>
        <div className="brand access-brand">Sentinel<span className="brand-accent">AI</span></div>
        <h1>Acesso protegido</h1>
        <p>Introduz o token de acesso configurado no backend para abrir o dashboard.</p>
        <label htmlFor="access-token">Token de acesso</label>
        <input id="access-token" type="password" autoComplete="current-password" value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        {error && <p className="access-error" role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={!value.trim() || busy}>{busy ? 'A verificar…' : 'Entrar'}</button>
        <small>O token fica apenas na memória desta página e desaparece ao atualizá-la.</small>
      </form>
    </main>
  )
}

export default App
