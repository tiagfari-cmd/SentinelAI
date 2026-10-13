import type { AuthenticationEvent } from './types'
export type ActivityPoint = { hour: string; success: number; failed: number }

export function compareTimestamps(left: string, right: string): number {
  const milliseconds = Date.parse(left) - Date.parse(right)
  if (milliseconds !== 0) return milliseconds
  const fraction = (value: string) => Number((/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '').padEnd(6, '0'))
  return fraction(left) - fraction(right)
}

export function buildHourlyActivity(events: AuthenticationEvent[]): ActivityPoint[] {
  const buckets = new Map<string, ActivityPoint>()
  for (const event of events) {
    // Include UTC date: 09:00 on different days is NOT the same hour.
    const hour = new Date(event.timestamp).toISOString().slice(0, 13) + ':00Z'
    const point = buckets.get(hour) ?? { hour, success: 0, failed: 0 }
    point[event.outcome] += 1; buckets.set(hour, point)
  }
  // Only observed buckets. Never allocate hours across a potentially vast date range.
  return [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour))
}
