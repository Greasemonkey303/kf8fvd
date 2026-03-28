#!/usr/bin/env node
// Simple smoke test for auth endpoints: 2FA request -> OTP sign-in -> forgot-password
async function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitForServer(base){
  for(let i=0;i<60;i++){
    try{
      const res = await fetch(base+'/',{method:'GET'})
      if (res.ok) return true
    }catch{}
    await wait(1000)
  }
  return false
}

async function main(){
  const base = process.env.SITE_URL || 'http://localhost:3000'
  const email = process.env.TEST_EMAIL || 'zach@kf8fvd.com'
  const password = process.env.TEST_PASSWORD || 'Zachjcke052/'
  process.env.CF_TURNSTILE_BYPASS = 'true'
  process.env.DEBUG_2FA = '1'

  if (!(await waitForServer(base))) {
    console.error('Server did not respond at', base)
    process.exit(2)
  }

  console.log('Requesting 2FA code for', email)
  try{
    const r = await fetch(base + '/api/auth/2fa/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const j = await r.json()
    console.log('2FA response:', JSON.stringify(j))
    const code = j?.debugCode || null
    if (!code) {
      console.error('No debugCode received; cannot complete OTP sign-in')
      process.exit(1)
    }

    console.log('Submitting credentials with OTP...')
    const params = new URLSearchParams()
    params.append('email', email)
    params.append('password', password)
    params.append('otp', code)

    const r2 = await fetch(base + '/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      redirect: 'manual'
    })
    console.log('Sign-in status:', r2.status)
    try{
      const txt = await r2.text()
      console.log('Sign-in body:', txt.slice(0,200))
    }catch{}

    console.log('Requesting forgot-password...')
    const r3 = await fetch(base + '/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    const j3 = await r3.json()
    console.log('forgot-password response:', JSON.stringify(j3))

    console.log('Smoke tests finished')
    process.exit(0)
  }catch(err){
    console.error('Smoke test failed:', err)
    process.exit(1)
  }
}

main()
