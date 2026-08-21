import { createAgentSessionServices } from '@earendil-works/pi-coding-agent'
import { homedir } from 'node:os'
import { join } from 'node:path'
const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')
const services = await createAgentSessionServices({ cwd: process.cwd(), agentDir })
console.log('extension loaded OK, error:', services.modelRuntime.getError() ?? 'none')
const models = await services.modelRuntime.getAvailable()
console.log('visible models:', models.length)
for (const m of models.filter(x => x.provider === 'antigravity').slice(0, 10)) console.log(' -', m.id)
process.exit(0)
