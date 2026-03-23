#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')

const MAX_FILE_SIZE = 1024 * 1024
const TEXT_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.yml', '.yaml',
  '.env', '.example', '.sh', '.ps1', '.sql', '.conf', '.ini', '.toml', '.properties', '.md'
])

const IGNORED_PATH_PATTERNS = [
  /^README\.md$/i,
  /^docs\//i,
  /^\.github\/workflows\//i,
  /^tests\/playwright\/env\.example$/i,
  /\.example$/i,
]

const SECRET_PATTERNS = [
  {
    name: 'private-key',
    regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    getValue: (match) => match[0],
  },
  {
    name: 'github-token',
    regex: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    getValue: (match) => match[0],
  },
  {
    name: 'aws-access-key',
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    getValue: (match) => match[0],
  },
  {
    name: 'secret-assignment',
    regex: /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY))\s*=\s*['"]?([^'"\s#`]+)['"]?/gm,
    getValue: (match) => `${match[1]}=${match[2]}`,
  },
]

const PLACEHOLDER_MARKERS = [
  'example', 'examples', 'placeholder', 'changeme', 'replace-me', 'replace_with',
  'dummy', 'sample', 'test', 'fake', 'your_', 'your-', 'todo', 'unset', 'null', 'none'
]

function getTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function looksTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  const base = path.basename(filePath).toLowerCase()
  if (base.startsWith('.env')) return true
  return false
}

function shouldIgnorePath(relativePath) {
  return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))
}

function shouldIgnoreValue(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return true
  if (normalized.includes('${') || normalized.includes('${{')) return true
  if (normalized.includes('process.env') || normalized.includes('env.') || normalized.includes('secrets.')) return true
  if (normalized.startsWith('<') && normalized.endsWith('>')) return true
  if (normalized.startsWith('http://localhost') || normalized.startsWith('https://localhost')) return true
  if (normalized.startsWith('redis://redis:') || normalized.startsWith('rediss://redis:')) return true
  if (normalized === 'true' || normalized === 'false') return true
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker))
}

function getLineNumber(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

function scanFile(relativePath) {
  if (shouldIgnorePath(relativePath)) return []
  const absPath = path.join(repoRoot, relativePath)
  if (!looksTextFile(absPath)) return []
  let stat
  try {
    stat = fs.statSync(absPath)
  } catch {
    return []
  }
  if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return []

  let text
  try {
    text = fs.readFileSync(absPath, 'utf8')
  } catch {
    return []
  }

  const findings = []
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      const lineText = text.slice(match.index, text.indexOf('\n', match.index) === -1 ? text.length : text.indexOf('\n', match.index)).trim()
      if (/^(?:\/\/|#|\*|\/\*|\*\/|-\s)/.test(lineText)) continue
      const value = pattern.getValue(match)
      if (pattern.name === 'secret-assignment' && shouldIgnoreValue(match[2])) continue
      findings.push({
        file: relativePath,
        line: getLineNumber(text, match.index),
        rule: pattern.name,
      })
    }
  }
  return findings
}

function main() {
  let files
  try {
    files = getTrackedFiles()
  } catch (error) {
    console.error('Failed to enumerate tracked files:', error instanceof Error ? error.message : String(error))
    process.exit(2)
  }

  const findings = files.flatMap(scanFile)

  if (findings.length === 0) {
    console.log('Secret scan passed: no tracked secret-like values found.')
    process.exit(0)
  }

  console.error('Secret scan failed. Review these tracked files:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.rule})`)
  }
  process.exit(1)
}

main()