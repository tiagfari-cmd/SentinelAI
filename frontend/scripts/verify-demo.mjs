import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const output = new URL('../dist-demo/', import.meta.url)
const headers = await readFile(new URL('_headers', output), 'utf8')
const chatEnabled = /connect-src 'self'/.test(headers)
assert.match(headers, /connect-src '(none|self)'/, 'No third-party connections are allowed')
assert.match(headers, /frame-ancestors 'none'/, 'Public demo must reject embedding')
assert.match(headers, /X-Content-Type-Options: nosniff/)
const html = await readFile(new URL('index.html', output), 'utf8')
assert.match(html, /SentinelAI/)
assert.doesNotMatch(html, /<script[^>]+src=["']https?:/)
for (const file of await readdir(new URL('assets/', output))) {
  if (!file.endsWith('.js')) continue
  const bundle = await readFile(new URL(`assets/${file}`, output), 'utf8')
  assert.doesNotMatch(bundle, /\/auth\/check|\/assistant|\/events\?limit|\/alerts\?limit|\/alerts\//, 'API request paths leaked into demo build')
  assert.doesNotMatch(bundle, /GEMINI_API_KEY|SENTINELAI_API_TOKEN|AIza[\w-]{30,}/, 'Secret marker found in public build')
  if (!chatEnabled) assert.doesNotMatch(bundle, /["']\/chat["']/, 'Free browser-only build must not include the chat endpoint')
}
console.log(`Public artifact verified: ${chatEnabled ? 'optional same-origin chat' : 'CSP blocks all connections and no chat endpoint'}, no private backend request paths or secrets.`)
