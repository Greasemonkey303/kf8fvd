import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { logRouteError, logRouteEvent } from '@/lib/observability'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const report = body && (body['csp-report'] || body)
    if (!report || Object.keys(report).length === 0) {
      return NextResponse.json({ ok: true }, { status: 204 })
    }

    const documentUri = report['document-uri'] || report.documentUri || null
    const referrer = report['referrer'] || null
    const blockedUri = report['blocked-uri'] || report.blockedUri || null
    const violatedDirective = report['violated-directive'] || report.violatedDirective || null
    const originalPolicy = report['original-policy'] || report.originalPolicy || null
    const userAgent = req.headers.get('user-agent') || null

    await query('INSERT INTO csp_reports (document_uri, referrer, blocked_uri, violated_directive, original_policy, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [documentUri, referrer, blockedUri, violatedDirective, originalPolicy, userAgent])

    logRouteEvent('warn', { route: 'api/csp/report', action: 'csp_report_received', resourceId: documentUri, reason: typeof violatedDirective === 'string' ? violatedDirective : null })

    return NextResponse.json({ ok: true })
  } catch (e) {
    logRouteError('api/csp/report', e, { action: 'csp_report_failed', reason: 'invalid_csp_report' })
    return NextResponse.json({ error: 'Invalid CSP report' }, { status: 400 })
  }
}
