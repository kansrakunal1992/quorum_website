/**
 * server.js — Quorum Website
 * ─────────────────────────────────────────────────────────────────────
 * Minimal Express server for the website Railway project.
 *
 * Responsibilities:
 *   1. Serve index.html and static assets from the same directory
 *   2. Handle POST /api/waitlist — proxy form submissions to Supabase
 *      using server-side credentials (never exposed in HTML)
 *   3. Serve /privacy, /cookies, /terms, /security as the same page
 *      stub until S3 builds proper legal pages
 *
 * Required Railway environment variables (set in website project):
 *   SUPABASE_URL         — https://your-project.supabase.co
 *   SUPABASE_SERVICE_KEY — service role key (bypasses RLS, server-only)
 *   PORT                 — injected automatically by Railway
 *
 * Start command: node server.js
 */

import express    from 'express'
import { createClient } from '@supabase/supabase-js'
import path       from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app       = express()
const PORT      = process.env.PORT ?? 3000

/* ── Startup checks ───────────────────────────────────────────────── */
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`[Startup] Missing required environment variables: ${missing.join(', ')}`)
  console.error('[Startup] Set these in the Railway website project environment settings.')
  process.exit(1)
}

/* ── Supabase client (service role — server-side only) ────────────── */
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
}

/* ── Middleware ───────────────────────────────────────────────────── */
app.use(express.json({ limit: '512kb' }))

// Serve index.html and any public assets (images, fonts, etc.)
app.use(express.static(__dirname, {
  index: 'index.html',
  etag: true,
  maxAge: '1h',
}))

/* ── POST /api/waitlist ───────────────────────────────────────────── */
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

app.post('/api/waitlist', async (req, res) => {
  try {
    const {
      interest_type,
      decision_summary,
      name,
      email,
      whatsapp,
      additional_context,
    } = req.body ?? {}

    /* Validate required fields */
    if (!interest_type?.trim()) {
      return res.status(400).json({ error: 'interest_type is required' })
    }
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }
    if (!email?.trim() || !EMAIL_RX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required' })
    }

    /* Insert into Supabase */
    const supabase = getSupabase()
    const { error } = await supabase
      .from('session_requests')
      .insert({
        interest_type:      interest_type.trim(),
        decision_summary:   decision_summary?.trim()     ?? null,
        name:               name.trim(),
        email:              email.trim().toLowerCase(),
        whatsapp:           whatsapp?.trim()             ?? null,
        additional_context: additional_context?.trim()   ?? null,
      })

    if (error) {
      console.error('[Waitlist] Supabase error:', error.message)
      return res.status(500).json({ error: 'Failed to save request. Please try again.' })
    }

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('[Waitlist] Unexpected error:', err)
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
})

/* ── Legal page stubs (S3 will replace with proper pages) ─────────── */
// Until /privacy, /cookies, /terms, /security pages are built in Sprint 3,
// these routes return a placeholder. Remove these once real pages exist.
const LEGAL_STUB = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Quorum</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #010204; color: #e8eaf0;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .box { max-width: 480px; text-align: center; }
    h1 { font-size: 28px; font-weight: 400; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.8; color: #8d9aaf; }
    a { color: #c9a84c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>This page is being prepared and will be published shortly.<br />
       <a href="/">← Back to Quorum</a></p>
  </div>
</body>
</html>`

app.get('/privacy',  (_req, res) => res.send(LEGAL_STUB('Privacy Policy')))
app.get('/cookies',  (_req, res) => res.send(LEGAL_STUB('Cookie Policy')))
app.get('/terms',    (_req, res) => res.send(LEGAL_STUB('Terms of Service')))
app.get('/security', (_req, res) => res.send(LEGAL_STUB('Security & Trust')))

/* ── Fallback → index.html ────────────────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

/* ── Start ────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`[Quorum Website] Running on port ${PORT}`)
})
