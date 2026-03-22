Nonce Sweep Report (initial)

This report lists source files that contain `dangerouslySetInnerHTML` or inline style/script insertions and gives a short recommendation for each.

Files found (from quick repo scan):

- components/credentials/CredentialCard.tsx : L38 -> <div className={styles.description} dangerouslySetInnerHTML={{ __html: (item.description_sanitized ?? (purify ? purify.sanitize(String(item.description || '')) : (item.description || ''))) }} />
- app/admin/projects/[id]/page.tsx : L711 -> <div style={{ color: 'var(--white-95)' }} dangerouslySetInnerHTML={{ __html: safeDescription }} />
- app/admin/projects/[id]/page.tsx : L712 -> {form.details ? <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: (safeDetails || '').slice(0, 400) + ((String(safeDetails || '').length > 400) ? '…' : '') }} /> : null}
- app/admin/projects/[id]/page.tsx : L728 -> <div style={{ color: 'var(--white-95)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: safeDescription }} />
- app/admin/projects/page.tsx : L586 -> return <div style={{ color: 'var(--white-95)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: descHtml }} />
- app/admin/pages/[id]/page.tsx : L74 -> {showPreview && <div className="card markdown-preview" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />}
- app/admin/messages/page.tsx : L132 -> <td className={styles.td} style={{maxWidth:420}} dangerouslySetInnerHTML={{__html: makeSafeHtmlFromText(String(it.message || '').substring(0, 1000))}} />
- app/admin/messages/page.tsx : L166 -> <div style={{border:'1px solid rgba(255,255,255,0.04)', borderRadius:8, padding:12, background:'var(--card-bg)'}} dangerouslySetInnerHTML={{ __html: (selected.message_sanitized ? (purify ? purify.sanitize(String(selected.message_sanitized)) : String(selected.message_sanitized)) : makeSafeHtmlFromText(selected.message || '')) }} />
- containers/projects/projects.tsx : L147 -> (uses dangerouslySetInnerHTML for project descriptions)
- containers/hero/hero.tsx : L98 -> (uses dangerouslySetInnerHTML)
- app/admin/credentials/page.tsx : L940 -> (uses dangerouslySetInnerHTML for description)
- app/admin/about/[id]/page.tsx : L712-L713 -> (uses dangerouslySetInnerHTML for summary & previewCard)
- app/admin/about/page.tsx : L478 -> (uses dangerouslySetInnerHTML for description)
- app/layout.tsx : uses `nonce` correctly for JSON-LD and external script tags (already covered)

Recommendations (actionable):

- For server-rendered JSON-LD or inline <script>/<style> tags: add `nonce` from the per-request cookie.
  - Example: make component `async` and use `const nonce = (await cookies()).get('csp-nonce')?.value` then render `<script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ... }} />`.

- For sanitized content inserted with `dangerouslySetInnerHTML` in client components (e.g., `components/credentials/CredentialCard.tsx`): ensure sanitization strips `<script>` and `<style>` tags (current `dompurify` usage appears OK). No `nonce` is necessary unless the HTML intentionally contains inline scripts/styles; in that case, move them to a server component and set `nonce` there.

- Avoid making wholesale automatic edits to client components. Create per-file small PR changes for server components that actually inject `<script>`/`<style>` tags.

Next steps I can take for you now:
- Create a PR branch with per-file edits for server components (convert to async, read nonce, add `nonce={nonce}` on relevant tags).
- Or create small commits adding `// TODO: add nonce` comments in candidate files to speed manual review.

If you'd like, I can start converting safe server files now (e.g., pages under `app/admin/*` that are server components). Otherwise I can open a draft PR with this report and the `tools/nonce-sweep.js` scanner included.
