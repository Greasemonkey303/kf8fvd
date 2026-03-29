#!/usr/bin/env node
const { spawn } = require('child_process')
const { runWithMaintenanceRecord } = require('./lib/maintenance_run_logger')

function parseArgs(argv) {
  const args = new Set(argv.slice(2))
  return {
    skipReadiness: args.has('--skip-readiness'),
    skipStorageAudit: args.has('--skip-storage-audit'),
    skipBuild: args.has('--skip-build'),
    withStorageWriteTest: args.has('--with-storage-write-test'),
    withE2E: args.has('--with-e2e'),
  }
}

function runStep(label, command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${label} ==`)
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} failed with exit code ${code}`))
    })
  })
}

async function main() {
  const options = parseArgs(process.argv)
  const steps = [
    { label: 'Check recorded migrations', command: 'node', args: ['scripts/check_pending_migrations.js'] },
    { label: 'Lint', command: 'npm', args: ['run', 'lint'] },
    { label: 'Unit and integration tests', command: 'npm', args: ['run', 'test:unit'] },
  ]

  if (!options.skipBuild) {
    steps.push({ label: 'Build', command: 'npm', args: ['run', 'build'] })
  }

  if (!options.skipReadiness) {
    const readinessArgs = ['run', 'readiness:backend']
    if (options.withStorageWriteTest) readinessArgs.push('--', '--storage-write-test')
    steps.push({ label: 'Backend readiness', command: 'npm', args: readinessArgs })
  }

  if (!options.skipStorageAudit) {
    steps.push({ label: 'Storage orphan audit', command: 'npm', args: ['run', 'storage:audit-orphans'] })
  }

  if (options.withE2E) {
    steps.push({ label: 'Playwright E2E', command: 'npm', args: ['run', 'e2e'] })
  }

  for (const step of steps) {
    await runStep(step.label, step.command, step.args)
  }

  console.log('\nRelease verification completed successfully.')
  return {
    summary: 'Release verification completed successfully.',
    meta: {
      stepCount: steps.length,
      options,
    },
  }
}

runWithMaintenanceRecord('release_verify', {
  commandText: 'node scripts/release_verify.js',
}, () => main()).catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})