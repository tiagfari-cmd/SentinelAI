import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const output = new URL('../dist-demo/', import.meta.url)
const headers = await readFile(new URL('_headers', output), 'utf8')
assert.match(headers, /connect-src 'none'/, 'Public demo must block API connections')
assert.match(headers, /frame-ancestors 'none'/, 'Public demo must reject embedding')
assert.match(headers, /X-Content-Type-Options: nosniff/)
const html = await readFile(new URL('index.html', output), 'utf8')
assert.match(html, /SentinelAI/)
assert.doesNotMatch(html, /<script[^>]+src=["']https?:/)
for (const file of await readdir(new URL('assets/', output))) {
  if (!file.endsWith('.js')) continue
  const bundle = await readFile(new URL(`assets/${file}`, output), 'utf8')
  assert.doesNotMatch(bundle, /\/auth\/check|\/assistant|\/events\?limit|\/alerts\?limit/, 'API request paths leaked into demo build')
  assert.doesNotMatch(bundle, /GEMINI_API_KEY|SENTINELAI_API_TOKEN|AIza[\w-]{30,}/, 'Secret marker found in public build')
}
console.log('Public demo artifact verified: restrictive headers and no backend request paths.')
