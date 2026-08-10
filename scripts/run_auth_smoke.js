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
  const email = process.env.TEST_EMAIL || ''
  const password = process.env.TEST_PASSWORD || ''
  const turnstileToken = process.env.TEST_TURNSTILE_TOKEN || ''

  if (!email || !password || !turnstileToken) {
    console.error('TEST_EMAIL, TEST_PASSWORD, and TEST_TURNSTILE_TOKEN are required')
    process.exit(2)
  }

  if (!(await waitForServer(base))) {
    console.error('Server did not respond at', base)
    process.exit(2)
  }

  console.log('Requesting a 2FA code')
  try{
    const r = await fetch(base + '/api/auth/2fa/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, cf_turnstile_response: turnstileToken })
    })
    const j = await r.json()
    console.log('2FA response:', JSON.stringify(j))
    if (!r.ok || !j?.ok) {
      console.error('2FA request failed')
      process.exit(1)
    }

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
