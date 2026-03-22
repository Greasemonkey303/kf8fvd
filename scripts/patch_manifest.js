const fs = require('fs')
const path = require('path')

const manifestPath = path.join(process.cwd(), '.next', 'routes-manifest.json')
if (!fs.existsSync(manifestPath)) {
  console.error('routes-manifest.json not found at', manifestPath)
  process.exit(2)
}

const raw = fs.readFileSync(manifestPath, 'utf8')
let j
try { j = JSON.parse(raw) } catch (e) { console.error('invalid JSON', e); process.exit(2) }

let patched = false
if (Array.isArray(j.headers)) {
  for (const route of j.headers) {
    if (!Array.isArray(route.headers)) continue
    for (const h of route.headers) {
      if (!h.key || typeof h.value !== 'string') continue
      if (h.key.toLowerCase() === 'content-security-policy') {
        let v = h.value
        const beforeScript = "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"
        const afterScript = "script-src 'self' https://unpkg.com https://challenges.cloudflare.com 'unsafe-inline' 'unsafe-eval'"
        const beforeStyle = "style-src 'self' https://unpkg.com https://fonts.googleapis.com"
        const afterStyle = "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com"
        if (v.includes(beforeScript) && !v.includes("'unsafe-inline'")) {
          v = v.replace(beforeScript, afterScript)
          patched = true
        }
        if (v.includes(beforeStyle) && !v.includes("'unsafe-inline'")) {
          v = v.replace(beforeStyle, afterStyle)
          patched = true
        }
        h.value = v
      }
    }
  }
}

if (!patched) {
  console.log('No CSP changes required')
  process.exit(0)
}

fs.writeFileSync(manifestPath, JSON.stringify(j, null, 2), 'utf8')
console.log('Patched routes-manifest.json with inline allowances')
process.exit(0)
