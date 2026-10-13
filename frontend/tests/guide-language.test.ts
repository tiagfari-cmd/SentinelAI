import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoReply } from '../src/demo-assistant'

afterEach(() => vi.unstubAllGlobals())

describe('bilingual predefined public guide', () => {
  it('defaults to Portuguese while allowing explicit English replies', () => {
    expect(demoReply('How does this dashboard work?')).toContain('quatro indicadores')
    expect(demoReply('Como funciona o dashboard?', 'en')).toContain('four indicators')
  })

  it.each([
    ['How does the dashboard work?', 'four indicators'],
    ['How does it work?', 'four indicators'],
    ['How can I review an alert?', 'does not delete'],
    ['How do I resolve an alert?', 'does not delete'],
    ['What does the status mean?', 'does not delete'],
    ['How do I filter events?', 'Filters apply'],
    ['How can I search?', 'Search for an IP'],
    ['How do I export JSON?', 'current search and filter'],
    ['Can my company use this?', 'private pilot'],
    ['How can I install it?', 'Docker'],
    ['Is it free?', 'free and open-source'],
    ['Are you a mini LLM?', 'not an LLM'],
    ['What features could we add?', 'Possible next milestones'],
  ])('answers an English topic: %s', (question, phrase) => {
    expect(demoReply(question, 'en')).toContain(phrase)
  })

  it.each([
    ['Como carregar um ficheiro?', 'ficheiro JSON'],
    ['Quero analisar dados reais', '5000 eventos'],
    ['Importar os meus eventos', 'não são enviados a servidores'],
  ])('explains local import in Portuguese: %s', (question, phrase) => {
    const answer = demoReply(question, 'pt')
    expect(answer).toContain(phrase)
    expect(answer).toContain('1 MiB')
    expect(answer).toContain('memória')
    expect(answer).toContain('recarregar')
    expect(answer).toContain('não é monitorização contínua')
    expect(answer).toContain('Docker')
  })

  it.each(['Can I upload real data?', 'How do I choose a file?', 'Import my events'])('explains local import in English: %s', (question) => {
    const answer = demoReply(question, 'en')
    expect(answer).toContain('1 MiB and 5000 events')
    expect(answer).toContain('timestamp, ip_address, username and outcome (failed or success)')
    expect(answer).toContain('logs are not sent to servers')
    expect(answer).toContain('memory')
    expect(answer).toContain('reload')
    expect(answer).toContain('not continuous monitoring')
    expect(answer).toContain('private Docker pilot')
  })

  it('does not offer the disabled public Gemini integration', () => {
    expect(demoReply('Gemini', 'pt')).toContain('preparada mas desativada')
    expect(demoReply('Gemini', 'en')).toContain('prepared but disabled')
    expect(demoReply('Gemini', 'en')).toContain('does not enable billing')
  })

  it('labels unknown replies as predefined in both languages', () => {
    expect(demoReply('Conta-me uma história inédita', 'pt')).toContain('pré-definidas')
    expect(demoReply('Write a brand new poem', 'en')).toContain('predefined answers')
  })

  it.each(['pt', 'en'] as const)('never calls the network or claims access to user records (%s)', (language) => {
    vi.stubGlobal('fetch', vi.fn())
    const answer = demoReply('dashboard', language)
    expect(answer).toContain(language === 'pt' ? 'Não tenho acesso aos teus dados brutos' : 'cannot access your raw event data')
    expect(answer).toContain(language === 'pt' ? 'Um alerta não confirma um ataque' : 'An alert does not confirm an attack')
    expect(fetch).not.toHaveBeenCalled()
  })
})
