import { describe, expect, it, vi } from 'vitest'
import { analyzeLocalJson } from '../src/local-analysis'

function event(second: number, overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date(Date.UTC(2026, 9, 13, 12, 0, 0) + second * 1000).toISOString(),
    ip_address: '203.0.113.42',
    username: 'fictional-user',
    outcome: 'failed',
    ...overrides,
  }
}

function analyze(events: unknown[]) {
  return analyzeLocalJson(JSON.stringify(events))
}

describe('bounded browser-only authentication log analysis', () => {
  it('normalizes and sorts a complete snapshot without inventing network data', () => {
    const result = analyze([
      event(3, { timestamp: '2026-10-13T13:00:03+01:00', username: ' user-z ', outcome: 'FAILED' }),
      event(0, { username: 'user-a' }),
      event(2, { username: 'user-a' }),
      event(1, { username: 'user-b' }),
      event(4, { username: 'user-c' }),
      event(2.5, { outcome: 'SUCCESS' }),
    ])
    expect(result.source).toBe('local')
    expect(result.eventTotal).toBe(6)
    expect(result.alertTotal).toBe(1)
    expect(result.events.map((item) => item.timestamp)).toEqual([
      '2026-10-13T12:00:00Z', '2026-10-13T12:00:01Z', '2026-10-13T12:00:02Z',
      '2026-10-13T12:00:02.500000Z', '2026-10-13T12:00:03Z', '2026-10-13T12:00:04Z',
    ])
    expect(result.alerts[0]).toMatchObject({
      id: 1, failure_count: 5, usernames: ['user-a', 'user-b', 'user-c', 'user-z'],
      first_failure: '2026-10-13T12:00:00Z', last_failure: '2026-10-13T12:00:04Z',
      detected_at: '2026-10-13T12:00:04Z', review_status: 'open', review_note: '', review_revision: 0, reviewed_at: null,
    })
    expect(result.alerts[0].message).toContain('não confirma um ataque')
  })

  it.each([
    [60, 1],
    [60.001, 0],
    [60.000001, 0],
  ])('uses an inclusive 60-second window at %s seconds', (lastSecond, expectedAlerts) => {
    const lastTimestamp = lastSecond === 60.000001 ? '2026-10-13T12:01:00.000001Z' : event(lastSecond).timestamp
    expect(analyze([event(0), event(15), event(30), event(45), event(0, { timestamp: lastTimestamp })]).alerts).toHaveLength(expectedAlerts)
  })

  it('retains microseconds in UTC and handles dates before the Unix epoch', () => {
    const result = analyze([
      event(0, { timestamp: '1969-12-31T23:59:59.000001Z' }),
      event(0, { timestamp: '1970-01-01T00:59:59.999999+01:00' }),
      event(0, { timestamp: '2024-02-29T23:00:00-01:00' }),
      event(0, { timestamp: '0001-01-01T00:00:00Z' }),
    ])
    expect(result.events.map((item) => item.timestamp)).toEqual([
      '0001-01-01T00:00:00Z', '1969-12-31T23:59:59.000001Z', '1969-12-31T23:59:59.999999Z', '2024-03-01T00:00:00Z',
    ])
  })

  it('normalizes IPv6 spellings into one source and keeps mapped IPv6 distinct from IPv4', () => {
    const result = analyze([
      event(0, { ip_address: '2001:0DB8:0000:0000:0000:0000:0000:0001' }),
      event(1, { ip_address: '2001:db8::1' }),
      event(2, { ip_address: ' 2001:DB8::1 ' }),
      event(3, { ip_address: '2001:db8:0:0:0:0:0:1' }),
      event(4, { ip_address: '2001:db8::01' }),
      event(1, { ip_address: '::ffff:192.0.2.1' }),
      event(2, { ip_address: '::ffff:c000:0201' }),
      event(3, { ip_address: '192.0.2.1' }),
    ])
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0].ip_address).toBe('2001:db8::1')
    expect(result.events.filter((item) => item.ip_address === '::ffff:c000:201')).toHaveLength(2)
    expect(result.events.filter((item) => item.ip_address === '192.0.2.1')).toHaveLength(1)
  })

  it('ignores successes for detection without clearing surrounding failures', () => {
    const result = analyze([event(0), event(1), event(2, { outcome: 'success' }), event(3), event(4), event(5)])
    expect(result.alerts[0].failure_count).toBe(5)
    expect(result.events).toHaveLength(6)
    expect(analyze([event(0), event(1), event(2), event(3), event(4, { outcome: 'success' })]).alerts).toEqual([])
  })

  it('suppresses duplicate alerts during a continuous burst and resets after a quiet window', () => {
    const times = [0, 10, 20, 30, 40, 50, 60, 70, 80, 81, 82, 150, 151, 152, 153, 154, 155]
    const alerts = analyze(times.map((second) => event(second))).alerts
    expect(alerts).toHaveLength(2)
    expect(alerts.map((alert) => alert.last_failure)).toEqual(['2026-10-13T12:00:40Z', '2026-10-13T12:02:34Z'])
    expect(alerts.map((alert) => alert.failure_count)).toEqual([5, 5])
  })

  it('detects independent IPs and assigns stable, bounded IDs after chronological ordering', () => {
    const rows = [0, 1, 2, 3, 4].flatMap((second) => [
      event(second, { ip_address: '203.0.113.9' }),
      event(second, { ip_address: '203.0.113.10' }),
    ])
    const result = analyze(rows)
    expect(result.alerts.map((alert) => [alert.id, alert.ip_address])).toEqual([[1, '203.0.113.10'], [2, '203.0.113.9']])
    expect(analyze(rows.reverse()).alerts).toEqual(result.alerts)
  })

  it('sorts evidence usernames by code point, not browser locale', () => {
    const usernames = ['😀', '\uE000', 'user-z', 'user-a', '😀']
    expect(analyze(usernames.map((username, index) => event(index, { username }))).alerts[0].usernames).toEqual(['user-a', 'user-z', '\uE000', '😀'])
  })

  it.each([
    ['2026-02-29T12:00:00Z'], ['2026-04-31T12:00:00Z'], ['2026-00-01T12:00:00Z'],
    ['2026-13-01T12:00:00Z'], ['2026-01-00T12:00:00Z'], ['2026-01-01T24:00:00Z'],
    ['2026-01-01T12:60:00Z'], ['2026-01-01T12:00:60Z'], ['0000-01-01T12:00:00Z'],
    ['2026-01-01T12:00:00'], ['2026-01-01T12:00:00+24:00'], ['2026-01-01T12:00:00+01:60'],
    ['2026-01-01T12:00:00.1234567Z'], ['2026-01-01'], ['2026-01-01 12:00:00Z'],
    ['0001-01-01T00:00:00+01:00'], ['9999-12-31T23:59:59-01:00'],
  ])('rejects invalid or unsupported timestamp %s without Date rollover', (timestamp) => {
    expect(() => analyze([event(0, { timestamp })])).toThrow('Evento 1: campo timestamp')
  })

  it.each([
    '999.0.0.1', '127.1', '0127.0.0.1', '0x7f.0.0.1', '192.0.2.1:80', 'localhost',
    'https://203.0.113.42', '2001:db8:::1', '1:2:3:4:5:6:7:8:9', '[::1]', 'fe80::1%eth0',
    '::1]/private', '::ffff:999.0.0.1', '',
  ])('rejects invalid or unsupported IP %s', (ip_address) => {
    expect(() => analyze([event(0, { ip_address })])).toThrow('Evento 1: campo ip_address')
  })

  it.each([
    [null], [[]], ['secret-value'], [42],
  ])('rejects non-object rows', (row) => {
    expect(() => analyze([event(0), row])).toThrow('Evento 2: deve ser um objeto JSON')
  })

  it('fails the complete import on invalid fields and never echoes private contents', () => {
    const cases = [
      event(1, { timestamp: 'PRIVATE-DATA' }), event(1, { ip_address: 'PRIVATE-DATA' }),
      event(1, { username: '' }), event(1, { username: ' '.repeat(10) }),
      event(1, { username: 'a'.repeat(121) }), event(1, { username: 12 }),
      event(1, { outcome: 'PRIVATE-DATA' }), event(1, { outcome: ' success' }),
      event(1, { outcome: null }), event(1, { 'PRIVATE-FIELD': 'PRIVATE-DATA' }),
    ]
    for (const row of cases) {
      expect(() => analyze([event(0), row])).toThrow('Evento 2:')
      try { analyze([event(0), row]) } catch (error) {
        expect(String(error)).not.toContain('PRIVATE-DATA')
        expect(String(error)).not.toContain('PRIVATE-FIELD')
      }
    }
    const { username: _removedUsername, ...missing } = event(0)
    expect(() => analyze([missing])).toThrow('campo username é obrigatório')
    expect(analyze([event(0, { username: '😀'.repeat(120) })]).events[0].username).toHaveLength(240)
    expect(() => analyze([event(0, { username: '😀'.repeat(121) })])).toThrow('120 caracteres')
  })

  it('rejects prototype-like fields without polluting any objects', () => {
    const record = JSON.stringify(event(0)).replace(/}$/, ',"__proto__":{"polluted":true}}')
    expect(() => analyzeLocalJson(`[${record}]`)).toThrow('campos não permitidos')
    expect(() => analyze([event(0, { constructor: 'PRIVATE-DATA' })])).toThrow('campos não permitidos')
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('checks byte and event count limits and supports an empty valid snapshot', () => {
    expect(() => analyzeLocalJson(' '.repeat(1024 * 1024 + 1))).toThrow('1 MiB')
    expect(() => analyzeLocalJson(JSON.stringify('é'.repeat(530_000)))).toThrow('1 MiB')
    expect(() => analyze(Array.from({ length: 5001 }, () => event(0)))).toThrow('5000 eventos')
    expect(analyze(Array.from({ length: 5000 }, () => event(0))).eventTotal).toBe(5000)
    expect(analyze([])).toEqual({ events: [], alerts: [], source: 'local', eventTotal: 0, alertTotal: 0 })
    expect(() => analyzeLocalJson('{"PRIVATE-DATA":')).toThrow('JSON válido')
    expect(() => analyzeLocalJson('{}')).toThrow('raiz do JSON')
  })

  it('does not call network or persistent browser storage', () => {
    const forbidden = vi.fn(() => { throw new Error('This import must stay local') })
    vi.stubGlobal('fetch', forbidden)
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden })
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden })
    try {
      expect(analyze([event(0), event(1), event(2), event(3), event(4)]).alerts).toHaveLength(1)
      expect(forbidden).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
