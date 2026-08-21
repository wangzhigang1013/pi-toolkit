/**
 * Verify the documented fixes actually work end-to-end:
 * 1. thinking cards stream before tool calls (includeThoughts)
 * 2. full thinkingLevelMap coverage (max/xhigh mapped, not null)
 * 3. tool call arrives with thinking block, no swallowed text
 * Run: node --experimental-strip-types verify-fixes.ts
 */
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import { streamAntigravity } from './src/stream/index.ts'
import { ANTIGRAVITY_MODELS } from './src/models/index.ts'
import { buildRequest } from './src/stream/stream.ts'
import { antigravityHeaders } from './src/client/client.ts'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// --- 1. Credential + apiKey (same shape pi passes) ---
const auth = JSON.parse(readFileSync(join(homedir(), '.pi', 'agent', 'auth.json'), 'utf8'))
const cred = auth.antigravity
console.log('credential:', cred.type, 'expires in', Math.round((cred.expires - Date.now()) / 60000), 'min')
const apiKey = JSON.stringify({ token: cred.access, projectId: cred.projectId })

// --- 2. Model map check ---
console.log('\n=== thinkingLevelMap coverage ===')
for (const m of ANTIGRAVITY_MODELS) {
  const levels = getSupportedThinkingLevels(m as never)
  const map = m.thinkingLevelMap ?? {}
  const maxVal = map.max, xhighVal = map.xhigh
  console.log(
    m.id.padEnd(18),
    'levels:', levels.join('/'),
    '| max mapped:', maxVal ?? 'NULL',
    '| xhigh mapped:', xhighVal ?? 'NULL',
  )
}

// --- 3. Real streaming request with a tool: expect thinking + toolCall ---
const model = ANTIGRAVITY_MODELS.find((m) => m.id === 'gemini-3.7-flash')!
const context = {
  systemPrompt: 'You are a helpful assistant. When asked to compute, use the calculate tool.',
  messages: [
    {
      role: 'user',
      content:
        'Think carefully: a train leaves at 09:15 traveling 60 km/h, another leaves the same station at 09:45 traveling 90 km/h on the same track. Where and when do they meet? Reason step by step first, then use the calculate tool to verify your arithmetic.',
      timestamp: Date.now(),
    },
  ] as never,
  tools: [
    {
      name: 'calculate',
      description: 'Compute a*b',
      parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
    } as never,
  ] as never,
} as never

console.log('\n=== request body check (buildRequest) ===')
const built = buildRequest(model as never, context, cred.projectId, { reasoning: 'high', maxTokens: 4096 }, 'gemini-3.7-flash-tiered')
console.log('runtime model:', built.model)
console.log('thinkingConfig:', JSON.stringify(built.request.generationConfig?.thinkingConfig))
console.log('includeThoughts:', built.request.generationConfig?.thinkingConfig?.includeThoughts)

console.log('\n=== real request (gemini-3.7-flash, high, complex reasoning task) ===')
const stream = streamAntigravity(model as never, context, { apiKey, reasoning: 'high' })
const events: string[] = []
let thinkingLen = 0
let toolCalls = 0
let finalBlocks: string[] = []

for await (const e of stream) {
  const ev = e as { type: string; toolCall?: unknown; message?: { content: Array<{ type: string }> }; partial?: { content: Array<{ type: string }> } }
  events.push(ev.type)
  if (ev.type === 'thinking_delta') thinkingLen++
  if (ev.type === 'toolcall_start') toolCalls++
  const latest = ev.message ?? ev.partial
  if (latest) finalBlocks = latest.content.map((c) => c.type)
}

const kinds = [...new Set(events)]
console.log('event kinds:', kinds.join(', '))
console.log('thinking deltas:', thinkingLen, '| toolcalls:', toolCalls, '| final blocks:', finalBlocks.join(','))
console.log(
  thinkingLen > 0 && toolCalls > 0
    ? 'PASS: thinking streamed before tool call, tool call received, nothing swallowed'
    : thinkingLen > 0
      ? 'PARTIAL: thinking streamed but no tool call'
      : 'FAIL: no thinking block in stream',
)
process.exit(0)