import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check, KeyRound,
  ChevronRight, CircleHelp, Clock3, Download, LayoutDashboard, Menu,
  RefreshCw, Search, Server, Shield, ShieldAlert, Users, X,
} from 'lucide-react'
import { Assistant } from './Assistant'
import { loadDashboardData, setAccessToken, UnauthorizedError, verifyAccessToken } from './api'
import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'
import './App.css'

const ActivityChart = lazy(() => import('./ActivityChart'))

type Section = 'overview' | 'alerts' | 'events'
type EventFilter = 'all' | 'failed' | 'success'

const emptyData: DashboardData = { events: [], alerts: [], source: 'api' }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function alertPriority(alert: SecurityAlert) {
  return alert.failure_count >= 10 ? 'critical' : 'high'
}

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [eventFilter, setEventFilter] = useState<EventFilter>('all')
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [accessRequired, setAccessRequired] = useState(false)
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [checkingAccess, setCheckingAccess] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setData(await loadDashboardData())
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        setAccessToken('')
        setAccessRequired(true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadDashboardData()
      .then((initialData) => { if (active) setData(initialData) })
      .catch((error: unknown) => { if (active && error instanceof UnauthorizedError) setAccessRequired(true) })
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
      setAccessInput('')
      setAccessRequired(false)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Não foi possível validar o acesso.')
    } finally {
      setCheckingAccess(false)
    }
  }

  const filteredEvents = useMemo(() => data.events
    .filter((event) => eventFilter === 'all' || event.outcome === eventFilter)
    .filter((event) => `${event.ip_address} ${event.username} ${event.outcome}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [data.events, eventFilter, query])

  const filteredAlerts = useMemo(() => data.alerts
    .filter((alert) => `${alert.ip_address} ${alert.usernames.join(' ')} ${alert.message}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.last_failure.localeCompare(a.last_failure)), [data.alerts, query])

  const failedCount = data.events.filter((event) => event.outcome === 'failed').length
  const successCount = data.events.length - failedCount
  const monitoredIps = new Set(data.events.map((event) => event.ip_address)).size
  const criticalAlerts = data.alerts.filter((alert) => alertPriority(alert) === 'critical').length
  const alertShare = data.alerts.length ? 100 : 0
  const criticalShare = data.alerts.length ? (criticalAlerts / data.alerts.length) * 100 : 0

  if (accessRequired) {
    return <AccessGate value={accessInput} onChange={setAccessInput} onSubmit={unlock} error={accessError} busy={checkingAccess} />
  }

  function exportEvents() {
    const file = new Blob([JSON.stringify(data.events, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sentinelai-events.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const nav = (
    <>
      <div className="nav-label">Monitorização</div>
      <button className={`nav-link ${section === 'overview' ? 'selected' : ''}`} onClick={() => { setSection('overview'); setMobileNavOpen(false) }}><LayoutDashboard size={17} /> Visão geral</button>
      <button className={`nav-link ${section === 'alerts' ? 'selected' : ''}`} onClick={() => { setSection('alerts'); setMobileNavOpen(false) }}><ShieldAlert size={17} /> Alertas <span className="nav-count">{data.alerts.length}</span></button>
      <button className={`nav-link ${section === 'events' ? 'selected' : ''}`} onClick={() => { setSection('events'); setMobileNavOpen(false) }}><Activity size={17} /> Eventos</button>
    </>
  )

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Shield size={19} /></span><span>Sentinel<span className="brand-accent">AI</span></span></div>
        <div className="workspace-card"><div className="workspace-icon"><Server size={17} /></div><div><strong>Ambiente local</strong><small>Monitorização educativa</small></div><span className="live-dot" /></div>
        <nav aria-label="Navegação principal">{nav}</nav>
        <div className="sidebar-bottom"><div className="simulated-mark"><Activity size={18} /><span>Dados para demonstração</span></div><p>Não ligado a sistemas reais</p><div className="profile"><span className="avatar">SA</span><div><strong>Analista de segurança</strong><small>Perfil de demonstração</small></div></div></div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="Fechar navegação" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Abrir navegação" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><Shield size={15} /><span>Workspace</span><ChevronRight size={14} /><strong>{section === 'overview' ? 'Visão geral' : section === 'alerts' ? 'Alertas' : 'Eventos'}</strong></div>
          <div className="top-actions"><span className={`connection-pill ${data.source}`}><i />{data.source === 'api' ? 'API local' : 'Demonstração — dados fictícios'}</span><button className="icon-button" onClick={() => void refresh()} aria-label="Atualizar dados"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button><button className="icon-button notification-button" aria-label="Notificações"><Bell size={17} /><i /></button><span className="top-avatar">SA</span></div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div><div className="eyebrow"><span /> CENTRO DE OPERAÇÕES DE SEGURANÇA</div><h1>{section === 'overview' ? 'Visão geral' : section === 'alerts' ? 'Alertas de segurança' : 'Histórico de eventos'}</h1><p>Acompanha eventos de autenticação e sinais que merecem investigação.</p></div>
            <div className="heading-actions"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar IP ou utilizador" /></label><button className="button secondary" onClick={exportEvents}><Download size={15} /> Exportar</button></div>
          </div>

          {data.source === 'demo' && <div className="demo-banner"><CircleHelp size={16} /><span>Estás a ver dados fictícios. Inicia a API local para carregar eventos guardados na base de dados.</span></div>}
          {data.source === 'api' && data.events.length === 0 && <div className="demo-banner neutral"><Check size={16} /><span>API ligada. Ainda não existem eventos guardados. Envia um evento em <code>POST /events</code> para começar.</span></div>}

          {section === 'overview' && (
            <>
              <section className="stats-grid" aria-label="Estatísticas">
                <StatCard icon={<Activity size={17} />} label="Eventos recebidos" value={data.events.length.toLocaleString('pt-PT')} note={data.source === 'demo' ? 'amostra fictícia' : 'na base de dados'} tone="mint" />
                <StatCard icon={<AlertTriangle size={17} />} label="Alertas por investigar" value={data.alerts.length.toLocaleString('pt-PT')} note="regra determinística" tone="red" />
                <StatCard icon={<Check size={17} />} label="Autenticações bem-sucedidas" value={successCount.toLocaleString('pt-PT')} note="nos eventos carregados" tone="mint" />
                <StatCard icon={<Users size={17} />} label="IPs observados" value={monitoredIps.toLocaleString('pt-PT')} note="endereços distintos" tone="blue" />
              </section>

              <section className="visual-grid">
                <div className="panel activity-panel"><div className="panel-heading"><div><h2><Activity size={17} /> Atividade de autenticação</h2><p>Eventos recebidos, agrupados por hora</p></div><span className="range-label"><Clock3 size={14} /> Período disponível</span></div><div className="chart-summary"><strong>{data.events.length.toLocaleString('pt-PT')}</strong><span>eventos</span><em><ArrowUpRight size={14} /> {failedCount} falhas</em></div><div className="chart-wrap">{data.events.length ? <Suspense fallback={<EmptyState text="A preparar o gráfico…" />}><ActivityChart events={data.events} /></Suspense> : <EmptyState text="Ainda não há eventos suficientes para desenhar o gráfico." />}</div><div className="chart-legend"><span><i className="mint-dot" /> Sucesso ({successCount})</span><span><i className="red-dot" /> Falha ({failedCount})</span></div></div>
                <div className="panel breakdown-panel"><div className="panel-heading"><div><h2><ShieldAlert size={17} /> Resumo dos alertas</h2><p>Sinais que requerem revisão</p></div></div><div className="alert-total"><div className="donut" style={{ '--critical-share': `${criticalShare}%`, '--alert-share': `${alertShare}%` } as CSSProperties}><strong>{data.alerts.length}</strong><span>total</span></div></div><div className="severity-legend"><div><span><i className="red-dot" />Prioridade crítica*</span><b>{criticalAlerts}</b></div><div><span><i className="orange-dot" />Prioridade elevada*</span><b>{data.alerts.filter((alert) => alertPriority(alert) === 'high').length}</b></div></div><p className="severity-footnote">* Indicador visual baseado no número de falhas. Não confirma um ataque.</p></div>
              </section>

              <section className="panel list-panel"><div className="panel-heading list-heading"><div><h2><ShieldAlert size={17} /> Alertas recentes <span className="count-tag">{filteredAlerts.length}</span></h2><p>Sequências detetadas pela regra de autenticação</p></div><button className="text-button" onClick={() => setSection('alerts')}>Ver todos <ArrowUpRight size={14} /></button></div>{filteredAlerts.length ? filteredAlerts.slice(0, 4).map((alert, index) => <AlertRow key={`${alert.ip_address}-${alert.first_failure}-${index}`} alert={alert} onClick={() => setSelectedAlert(alert)} />) : <EmptyState text="Sem alertas para mostrar." />}</section>
              <EventsTable events={filteredEvents.slice(0, 5)} onViewAll={() => setSection('events')} />
            </>
          )}

          {section === 'alerts' && <section className="panel list-panel full-list"><div className="panel-heading list-heading"><div><h2><ShieldAlert size={17} /> Alertas <span className="count-tag">{filteredAlerts.length}</span></h2><p>Todos os sinais detetados; cada um precisa de análise humana.</p></div></div>{filteredAlerts.length ? filteredAlerts.map((alert, index) => <AlertRow key={`${alert.ip_address}-${alert.first_failure}-${index}`} alert={alert} onClick={() => setSelectedAlert(alert)} />) : <EmptyState text="Não foram encontrados alertas." />}</section>}

          {section === 'events' && <section className="panel events-panel"><div className="panel-heading events-heading"><div><h2><Activity size={17} /> Eventos de autenticação <span className="count-tag">{filteredEvents.length}</span></h2><p>Registos carregados da API ou dados de demonstração.</p></div><select aria-label="Filtrar eventos por resultado" value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)}><option value="all">Todos os resultados</option><option value="failed">Falhas</option><option value="success">Sucessos</option></select></div><EventsTable events={filteredEvents} /></section>}

          <footer className="page-footer"><span><i /> Deteção determinística · sem classificação automática de ataques</span><span>SentinelAI · protótipo educativo</span></footer>
        </div>
      </main>

      {selectedAlert && <AlertDialog alert={selectedAlert} onClose={() => setSelectedAlert(null)} />}
      <Assistant />
    </div>
  )
}

function StatCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span><div className={`sparkline ${tone}`}><i /><i /><i /><i /><i /><i /><i /></div></article>
}

function AlertRow({ alert, onClick }: { alert: SecurityAlert; onClick: () => void }) {
  const priority = alertPriority(alert)
  return <button className="alert-row" onClick={onClick}><span className={`alert-icon ${priority}`}><ShieldAlert size={16} /></span><span className="alert-title"><strong>Várias falhas de autenticação</strong><small>{alert.ip_address} · {alert.usernames.join(', ')}</small></span><span className={`priority-pill ${priority}`}>{priority === 'critical' ? 'Crítica*' : 'Elevada*'}</span><span className="alert-count">{alert.failure_count} falhas</span><span className="alert-time">{formatDate(alert.last_failure)}</span><ChevronRight className="row-chevron" size={16} /></button>
}

function EventsTable({ events, onViewAll }: { events: AuthenticationEvent[]; onViewAll?: () => void }) {
  return <section className="panel events-panel"><div className="panel-heading events-heading"><div><h2><Activity size={17} /> Eventos recentes <span className="count-tag">{events.length}</span></h2><p>Atividade de autenticação observada</p></div>{onViewAll && <button className="text-button" onClick={onViewAll}>Ver histórico <ArrowUpRight size={14} /></button>}</div>{events.length ? <div className="table-scroll"><table><thead><tr><th>Data e hora</th><th>Endereço IP</th><th>Utilizador</th><th>Resultado</th></tr></thead><tbody>{events.map((event, index) => <tr key={`${event.timestamp}-${event.ip_address}-${index}`}><td><span className="event-clock"><Clock3 size={14} />{formatDate(event.timestamp)}</span></td><td><code>{event.ip_address}</code></td><td>{event.username}</td><td><span className={`result-pill ${event.outcome}`}><i />{event.outcome === 'failed' ? 'Falha' : 'Sucesso'}</span></td></tr>)}</tbody></table></div> : <EmptyState text="Não há eventos para mostrar. Envia um evento à API para começar." />}</section>
}

function AlertDialog({ alert, onClose }: { alert: SecurityAlert; onClose: () => void }) {
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title"><header><span className={`alert-icon ${alertPriority(alert)}`}><ShieldAlert size={18} /></span><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={18} /></button></header><div className="eyebrow"><span className="red-dot" /> ALERTA DE AUTENTICAÇÃO</div><h2 id="alert-dialog-title">Várias falhas de autenticação</h2><p className="dialog-description">{alert.message}</p><dl className="evidence-grid"><div><dt>Endereço IP</dt><dd>{alert.ip_address}</dd></div><div><dt>Número de falhas</dt><dd>{alert.failure_count}</dd></div><div><dt>Primeira falha observada</dt><dd>{formatDate(alert.first_failure)}</dd></div><div><dt>Última falha observada</dt><dd>{formatDate(alert.last_failure)}</dd></div><div><dt>Utilizadores associados</dt><dd>{alert.usernames.join(', ')}</dd></div><div><dt>Detetado pela regra</dt><dd>{formatDate(alert.detected_at)}</dd></div></dl><div className="investigation-note"><strong>Próximo passo sugerido</strong><p>Verifica os registos do sistema na origem e confirma com a pessoa responsável se reconhece esta atividade. O alerta não prova que ocorreu um ataque.</p></div><button className="button primary dialog-close" onClick={onClose}>Fechar detalhes <Check size={15} /></button></section></div>
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
