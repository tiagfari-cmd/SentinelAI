import { describe, expect, it } from 'vitest'
import { buildHourlyActivity, compareTimestamps } from '../src/activity'

describe('snapshot time accuracy', () => {
  it('orders zero fractions and microsecond fractions correctly', () => {
    expect(compareTimestamps('2026-10-13T12:00:00Z', '2026-10-13T12:00:00.000001Z')).toBeLessThan(0)
    expect(compareTimestamps('2026-10-13T12:00:00.123456Z', '2026-10-13T12:00:00.123455Z')).toBeGreaterThan(0)
    expect(compareTimestamps('2026-10-13T13:00:00+01:00', '2026-10-13T12:00:00Z')).toBe(0)
  })
  it('does not merge the same hour across days or allocate missing millennia', () => {
    const events = ['0001-01-01T09:00:00Z', '2026-10-12T09:01:00Z', '2026-10-13T09:02:00Z', '9999-12-31T09:00:00Z'].map((timestamp) => ({ timestamp, ip_address: '192.0.2.1', username: 'example', outcome: 'failed' as const }))
    const points = buildHourlyActivity(events)
    expect(points).toHaveLength(4)
    expect(points.map((point) => point.failed)).toEqual([1, 1, 1, 1])
    expect(points[1].hour).toBe('2026-10-12T09:00Z')
  })
})
