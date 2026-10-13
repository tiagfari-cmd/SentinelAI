import type { AuthenticationEvent, DashboardData, SecurityAlert } from './types'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_EVENTS = 5000
const REQUIRED_FIELDS = ['timestamp', 'ip_address', 'username', 'outcome'] as const
const WINDOW_MICROSECONDS = 60_000_000n
const FAILURE_THRESHOLD = 5

type ValidatedEvent = {
  event: AuthenticationEvent
  timestampMicroseconds: bigint
}

function invalidField(row: number, field: string, explanation: string): never {
  // Never interpolate file contents: logs can contain credentials or private data.
  throw new Error(`Evento ${row}: campo ${field} ${explanation}.`)
}

function parseTimestamp(value: unknown, row: number): { timestamp: string; microseconds: bigint } {
  if (typeof value !== 'string') invalidField(row, 'timestamp', 'deve ser texto ISO 8601 com fuso horário')
  // A deliberately bounded subset of ISO 8601; no implicit local timezone or date rollover.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim())
  if (!parts) invalidField(row, 'timestamp', 'deve usar YYYY-MM-DDTHH:mm:ss[.ffffff]Z ou um desvio ±HH:MM')

  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const hour = Number(parts[4])
  const minute = Number(parts[5])
  const second = Number(parts[6])
  const fraction = Number((parts[7] ?? '').padEnd(6, '0'))
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) {
    invalidField(row, 'timestamp', 'contém uma data ou hora inválida')
  }

  const zone = parts[8]
  let offsetMinutes = 0
  if (zone !== 'Z') {
    const offsetHours = Number(zone.slice(1, 3))
    const offsetRemainder = Number(zone.slice(4, 6))
    if (offsetHours > 23 || offsetRemainder > 59) invalidField(row, 'timestamp', 'contém um fuso horário inválido')
    offsetMinutes = (offsetHours * 60 + offsetRemainder) * (zone[0] === '+' ? 1 : -1)
  }

  // setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
  const localDate = new Date(0)
  localDate.setUTCFullYear(year, month - 1, day)
  localDate.setUTCHours(hour, minute, second, 0)
  const utcMilliseconds = localDate.getTime() - offsetMinutes * 60_000
  const utcDate = new Date(utcMilliseconds)
  if (utcDate.getUTCFullYear() < 1 || utcDate.getUTCFullYear() > 9999) invalidField(row, 'timestamp', 'fica fora do intervalo UTC suportado')
  const fractionText = fraction === 0 ? '' : `.${String(fraction).padStart(6, '0')}`
  return {
    timestamp: `${utcDate.toISOString().slice(0, 19)}${fractionText}Z`,
    microseconds: BigInt(utcMilliseconds) * 1000n + BigInt(fraction),
  }
}

function normalizeIp(value: unknown, row: number): string {
  if (typeof value !== 'string') invalidField(row, 'ip_address', 'deve ser um endereço IPv4 ou IPv6')
  const address = value.trim()
  if (address.length > 45) invalidField(row, 'ip_address', 'deve ser um endereço IPv4 ou IPv6 válido')
  if (!address.includes(':')) {
    const octets = address.split('.')
    if (octets.length !== 4 || octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)) {
      invalidField(row, 'ip_address', 'deve ser um endereço IPv4 ou IPv6 válido')
    }
    return octets.map((octet) => String(Number(octet))).join('.')
  }
  // Only an IPv6 literal may enter URL parsing: no hostnames, zones, ports or paths.
  if (!/^[\da-fA-F:.]+$/.test(address)) invalidField(row, 'ip_address', 'deve ser um endereço IPv4 ou IPv6 válido, sem identificador de zona')
  try {
    const hostname = new URL(`http://[${address}]/`).hostname
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) throw new Error('Invalid IPv6')
    return hostname.slice(1, -1)
  } catch {
    return invalidField(row, 'ip_address', 'deve ser um endereço IPv4 ou IPv6 válido')
  }
}

function validateEvent(value: unknown, row: number): ValidatedEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Evento ${row}: deve ser um objeto JSON.`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !(REQUIRED_FIELDS as readonly string[]).includes(key))) {
    throw new Error(`Evento ${row}: contém campos não permitidos; usa apenas timestamp, ip_address, username e outcome.`)
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) invalidField(row, field, 'é obrigatório')
  }
  const parsedTimestamp = parseTimestamp(record.timestamp, row)
  const ipAddress = normalizeIp(record.ip_address, row)
  if (typeof record.username !== 'string' || !record.username.trim()) invalidField(row, 'username', 'deve ser texto não vazio')
  const username = record.username.trim()
  let usernameLength = 0
  for (const _character of username) {
    usernameLength += 1
    if (usernameLength > 120) invalidField(row, 'username', 'deve ter no máximo 120 caracteres')
  }
  if (typeof record.outcome !== 'string') invalidField(row, 'outcome', 'deve ser failed ou success')
  const outcome = record.outcome.toLowerCase()
  if (outcome !== 'failed' && outcome !== 'success') invalidField(row, 'outcome', 'deve ser failed ou success')
  return {
    event: { timestamp: parsedTimestamp.timestamp, ip_address: ipAddress, username, outcome },
    timestampMicroseconds: parsedTimestamp.microseconds,
  }
}

function compareText(left: string, right: string): number {
  // Python sorts Unicode code points, rather than locale-dependent collation.
  const leftCharacters = left[Symbol.iterator]()
  const rightCharacters = right[Symbol.iterator]()
  while (true) {
    const leftNext = leftCharacters.next()
    const rightNext = rightCharacters.next()
    if (leftNext.done || rightNext.done) return leftNext.done === rightNext.done ? 0 : leftNext.done ? -1 : 1
    const difference = leftNext.value.codePointAt(0)! - rightNext.value.codePointAt(0)!
    if (difference !== 0) return difference
  }
}

/** Analyze one bounded JSON snapshot locally; never sends or persists its contents. */
export function analyzeLocalJson(text: string): DashboardData {
  if (typeof text !== 'string') throw new Error('O ficheiro deve conter texto JSON.')
  if (text.length > MAX_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    throw new Error('O ficheiro ultrapassa o limite de 1 MiB.')
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('O ficheiro não contém JSON válido. Nenhum evento foi importado.')
  }
  if (!Array.isArray(input)) throw new Error('A raiz do JSON deve ser uma lista de eventos.')
  if (input.length > MAX_EVENTS) throw new Error('O ficheiro ultrapassa o limite de 5000 eventos.')
  const validated = input.map((event, index) => validateEvent(event, index + 1))
  validated.sort((left, right) => left.timestampMicroseconds < right.timestampMicroseconds ? -1 : left.timestampMicroseconds > right.timestampMicroseconds ? 1 : 0)

  const failuresByIp = new Map<string, ValidatedEvent[]>()
  for (const item of validated) {
    if (item.event.outcome !== 'failed') continue
    const failures = failuresByIp.get(item.event.ip_address)
    if (failures) failures.push(item)
    else failuresByIp.set(item.event.ip_address, [item])
  }
  const detected: { alert: SecurityAlert; microseconds: bigint }[] = []
  for (const [ipAddress, failures] of failuresByIp) {
    let windowStart = 0
    let sequenceHasAlert = false
    for (let index = 0; index < failures.length; index += 1) {
      const current = failures[index]
      while (current.timestampMicroseconds - failures[windowStart].timestampMicroseconds > WINDOW_MICROSECONDS) windowStart += 1
      const failureCount = index - windowStart + 1
      if (failureCount < FAILURE_THRESHOLD) sequenceHasAlert = false
      else if (!sequenceHasAlert) {
        const first = failures[windowStart].event.timestamp
        const last = current.event.timestamp
        const usernames = new Set<string>()
        for (let evidenceIndex = windowStart; evidenceIndex <= index; evidenceIndex += 1) usernames.add(failures[evidenceIndex].event.username)
        detected.push({
          microseconds: current.timestampMicroseconds,
          alert: {
            id: 0,
            review_status: 'open',
            review_note: '',
            review_revision: 0,
            reviewed_at: null,
            ip_address: ipAddress,
            first_failure: first,
            last_failure: last,
            detected_at: last,
            failure_count: failureCount,
            usernames: Array.from(usernames).sort(compareText),
            message: `Atividade suspeita: ${failureCount} falhas do IP ${ipAddress} entre ${first} e ${last}. Requer investigação; não confirma um ataque.`,
          },
        })
        sequenceHasAlert = true
      }
    }
  }
  detected.sort((left, right) => left.microseconds < right.microseconds ? -1 : left.microseconds > right.microseconds ? 1 : compareText(left.alert.ip_address, right.alert.ip_address))
  const alerts = detected.map(({ alert }, index) => ({ ...alert, id: index + 1 }))
  return {
    events: validated.map(({ event }) => event),
    alerts,
    source: 'local',
    eventTotal: validated.length,
    alertTotal: alerts.length,
  }
}
