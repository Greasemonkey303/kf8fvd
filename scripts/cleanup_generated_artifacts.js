#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { runWithMaintenanceRecord } = require('./lib/maintenance_run_logger')

function parseArgs(argv) {
  const args = argv.slice(2)
  const readValue = (name, fallback) => {
    const match = args.find((arg) => arg.startsWith(`${name}=`))
    if (!match) return fallback
    const raw = match.slice(name.length + 1)
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    apply: args.includes('--apply'),
    json: args.includes('--json'),
    keepDrills: readValue('--keep-drills', 2),
    drillMaxAgeDays: readValue('--drill-max-age-days', 7),
  }
}

function listBackupDrillTargets(rootDir, options) {
  const backupsDir = path.join(rootDir, 'data', 'backups')
  if (!fs.existsSync(backupsDir)) return []

  const entries = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('drill_'))
    .map((entry) => {
      const absolutePath = path.join(backupsDir, entry.name)
      const stats = fs.statSync(absolutePath)
      return {
        type: 'backup-drill',
        name: entry.name,
        absolutePath,
        modifiedAt: stats.mtimeMs,
      }
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt)

  const cutoff = Date.now() - (options.drillMaxAgeDays * 24 * 60 * 60 * 1000)
  return entries
    .filter((entry, index) => index >= options.keepDrills && entry.modifiedAt < cutoff)
}

function listTestResultTargets(rootDir) {
  const testResultsDir = path.join(rootDir, 'test-results')
  if (!fs.existsSync(testResultsDir)) return []

  return fs.readdirSync(testResultsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      type: 'test-result',
      name: entry.name,
      absolutePath: path.join(testResultsDir, entry.name),
    }))
}

function listTmpLogTargets(rootDir) {
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^tmp_.*\.(txt|log)$/i.test(entry.name))
    .map((entry) => ({
      type: 'tmp-log',
      name: entry.name,
      absolutePath: path.join(rootDir, entry.name),
    }))
}

function removeTarget(target) {
  fs.rmSync(target.absolutePath, { recursive: true, force: true })
}

function printReport(report) {
  console.log(`apply=${report.apply}`)
  console.log(`targetCount=${report.targets.length}`)
  console.log(`deletedCount=${report.deleted.length}`)
  if (report.targets.length) {
    console.log(`targets=${report.targets.map((target) => `${target.type}:${target.name}`).join(',')}`)
  }
}

function main() {
  const options = parseArgs(process.argv)
  const rootDir = process.cwd()
  const targets = [
    ...listBackupDrillTargets(rootDir, options),
    ...listTestResultTargets(rootDir),
    ...listTmpLogTargets(rootDir),
  ]

  const deleted = []
  if (options.apply) {
    for (const target of targets) {
      removeTarget(target)
      deleted.push(target.absolutePath)
    }
  }

  const report = {
    apply: options.apply,
    keepDrills: options.keepDrills,
    drillMaxAgeDays: options.drillMaxAgeDays,
    targets,
    deleted,
  }

  if (options.json) console.log(JSON.stringify(report, null, 2))
  else printReport(report)

  return {
    status: report.targets.length && !options.apply ? 'warning' : 'ok',
    summary: options.apply ? `Deleted ${report.deleted.length} generated artifacts.` : `Found ${report.targets.length} generated artifacts.`,
    meta: {
      apply: options.apply,
      targetCount: report.targets.length,
      deletedCount: report.deleted.length,
    },
  }
}

try {
  runWithMaintenanceRecord('cleanup_generated_artifacts', {
    commandText: 'node scripts/cleanup_generated_artifacts.js',
  }, async () => main()).catch((error) => {
    console.error('artifact cleanup failed', error)
    process.exit(1)
  })
} catch (error) {
  console.error('artifact cleanup failed', error)
  process.exit(1)
}