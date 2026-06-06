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


/* ── Shared legal page shell ──────────────────────────────────────── */
// APP_URL: where the Quorum app lives (for links to Privacy Center etc.)
const APP_URL = process.env.APP_URL ?? 'https://app.quorumvault.org'

const LEGAL_SHELL = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Quorum</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet" />
  <style>
    :root {
      --gold: #c9a84c; --gold-hi: #e2c46e; --gold-dim: rgba(201,168,76,0.25);
    }
    [data-theme="dark"] {
      --bg: #010204; --bg2: #04060f; --card: #080d1b; --card2: #0b1020;
      --b0: #0d1628; --b1: #182340; --b2: #243658;
      --t0: #ffffff; --t1: #edf2ff; --t2: #c8d6f0; --t3: #8fa8cc;
      --t4: #506484; --t5: #263d5e;
      --gold: #c9a84c;
    }
    [data-theme="light"] {
      --bg: #f4f1eb; --bg2: #ede9e0; --card: #ffffff; --card2: #f8f6f1;
      --b0: #c8cdd8; --b1: #aab2c2; --b2: #8896b0;
      --t0: #060d1c; --t1: #0e1a30; --t2: #1e2e48; --t3: #3a4f70;
      --t4: #667a9e; --t5: #a0b0c8;
      --gold: #9a7020;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 16px; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: var(--bg); color: var(--t2);
      min-height: 100vh; line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Nav ── */
    .legal-nav {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg2); border-bottom: 1px solid var(--b0);
      padding: 14px 32px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .legal-nav-logo {
      font-family: 'DM Mono', monospace; font-size: 13px;
      letter-spacing: 0.12em; color: var(--t1); text-decoration: none;
    }
    .legal-nav-logo span { color: var(--gold); }
    .legal-nav-back {
      font-family: 'DM Mono', monospace; font-size: 11px;
      letter-spacing: 0.08em; color: var(--t4); text-decoration: none;
    }
    .legal-nav-back:hover { color: var(--t2); text-decoration: none; }
    .theme-toggle {
      background: none; border: 1px solid var(--b1);
      color: var(--t4); font-size: 11px; padding: 5px 10px;
      border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace;
      letter-spacing: 0.06em;
    }

    /* ── Page container ── */
    .legal-wrap { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }

    /* ── Header ── */
    .legal-eyebrow {
      font-family: 'DM Mono', monospace; font-size: 10px;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--t4); margin-bottom: 12px;
    }
    .legal-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(28px, 4vw, 42px); font-weight: 400;
      letter-spacing: -0.02em; color: var(--t0); line-height: 1.15;
      margin-bottom: 12px;
    }
    .legal-meta {
      font-family: 'DM Mono', monospace; font-size: 11px;
      color: var(--t4); letter-spacing: 0.06em; margin-bottom: 32px;
    }
    hr.legal-rule { border: none; border-top: 1px solid var(--b0); margin-bottom: 40px; }

    /* ── Lead paragraph ── */
    .legal-lead {
      font-size: 15px; color: var(--t2); line-height: 1.85;
      border-left: 2px solid var(--gold-dim); padding-left: 18px;
      margin-bottom: 40px;
    }

    /* ── Sections ── */
    .legal-section { margin-bottom: 40px; }
    .legal-section h2 {
      font-size: 13px; font-weight: 600; color: var(--t1);
      letter-spacing: 0.01em; margin-bottom: 14px;
      padding-bottom: 8px; border-bottom: 1px solid var(--b0);
    }
    .legal-section p { font-size: 14px; color: var(--t3); line-height: 1.85; margin-bottom: 10px; }
    .legal-section ul { padding-left: 18px; margin-bottom: 10px; }
    .legal-section li { font-size: 14px; color: var(--t3); line-height: 1.8; margin-bottom: 6px; }

    /* ── Table (2-col key/value) ── */
    .legal-table { border: 1px solid var(--b0); border-radius: 10px; overflow: hidden; margin: 8px 0 12px; width: 100%; }
    .legal-table-row { display: grid; grid-template-columns: 180px 1fr; border-top: 1px solid var(--b0); }
    .legal-table-row:first-child { border-top: none; }
    .legal-table-row:nth-child(odd)  { background: var(--card); }
    .legal-table-row:nth-child(even) { background: var(--card2); }
    .legal-table-key {
      padding: 11px 14px; font-size: 12px; font-weight: 600;
      color: var(--t2); border-right: 1px solid var(--b0);
    }
    .legal-table-val {
      padding: 11px 14px; font-size: 13px; color: var(--t3); line-height: 1.6;
    }

    /* ── Highlight box (used in Terms AI disclaimer) ── */
    .legal-highlight {
      background: var(--card); border: 1px solid var(--gold-dim);
      border-left: 3px solid var(--gold); border-radius: 10px;
      padding: 14px 18px; font-size: 13.5px; color: var(--t2);
      line-height: 1.75; margin-bottom: 12px;
    }

    /* ── Security check/cross rows ── */
    .security-row {
      display: flex; gap: 14px; align-items: flex-start;
      background: var(--card); border: 1px solid var(--b0);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 10px;
    }
    .security-check {
      flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
      background: rgba(74,222,128,0.12); border: 1px solid rgba(74,222,128,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #4ade80; margin-top: 2px;
    }
    .security-cross {
      flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
      background: rgba(100,100,100,0.1); border: 1px solid var(--b1);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: var(--t4); margin-top: 2px;
    }
    .security-row-content h3 { font-size: 13px; font-weight: 600; color: var(--t1); margin-bottom: 3px; }
    .security-row-content p  { font-size: 13px; color: var(--t3); line-height: 1.65; margin: 0; }

    /* ── Cookie registry cards ── */
    .cookie-card {
      background: var(--card); border: 1px solid var(--b0);
      border-radius: 10px; overflow: hidden; margin-bottom: 10px;
    }
    .cookie-card-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: var(--card2);
      border-bottom: 1px solid var(--b0); gap: 12px; flex-wrap: wrap;
    }
    .cookie-card-key {
      font-family: 'DM Mono', monospace; font-size: 11.5px;
      color: var(--t0); letter-spacing: 0.04em;
    }
    .cookie-badge {
      padding: 3px 9px; border-radius: 100px; font-size: 10.5px;
      font-family: 'DM Mono', monospace; color: var(--t3);
      white-space: nowrap;
    }
    .badge-necessary { background: rgba(46,102,68,0.18); border: 1px solid rgba(46,102,68,0.4); }
    .badge-auth      { background: rgba(26,82,168,0.15); border: 1px solid rgba(26,82,168,0.35); }
    .badge-functional{ background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.3); }
    .cookie-card-body { padding: 10px 14px; }
    .cookie-card-purpose { font-size: 13px; color: var(--t3); line-height: 1.65; margin-bottom: 5px; }
    .cookie-card-duration {
      font-family: 'DM Mono', monospace; font-size: 11px;
      color: var(--t4); letter-spacing: 0.04em;
    }

    /* ── Footer ── */
    .legal-footer {
      border-top: 1px solid var(--b0); padding: 18px 32px;
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 12px; background: var(--card);
    }
    .legal-footer-links { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .legal-footer-links a { font-size: 11.5px; color: var(--t4); }
    .legal-footer-links span { color: var(--b1); font-size: 11px; }
    .legal-footer-copy { font-size: 11px; color: var(--t4); font-family: 'DM Mono', monospace; }

    @media (max-width: 600px) {
      .legal-nav { padding: 12px 16px; }
      .legal-wrap { padding: 32px 16px 64px; }
      .legal-table-row { grid-template-columns: 140px 1fr; }
    }
  </style>
</head>
<body>
  <script>
    try {
      var t = localStorage.getItem('quorum_theme');
      if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    } catch(e) {}
  </script>

  <nav class="legal-nav">
    <a href="/" class="legal-nav-logo">QUORUM<span>.</span></a>
    <div style="display:flex;align-items:center;gap:14px;">
      <a href="/" class="legal-nav-back">← quorumvault.org</a>
      <button class="theme-toggle" onclick="
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('quorum_theme', next); } catch(e) {}
        this.textContent = next === 'dark' ? 'Light' : 'Dark';
      ">Light</button>
    </div>
  </nav>

  <div class="legal-wrap">
    ${bodyHtml}
  </div>

  <footer class="legal-footer">
    <div class="legal-footer-links">
      <a href="/privacy">Privacy Policy</a>
      <span>·</span><a href="/cookies">Cookie Policy</a>
      <span>·</span><a href="/terms">Terms</a>
      <span>·</span><a href="/security">Security &amp; Trust</a>
    </div>
    <span class="legal-footer-copy">© 2026 Quorum</span>
  </footer>
</body>
</html>`

/* ── Privacy Policy ──────────────────────────────────────────────── */
app.get('/privacy', (_req, res) => res.send(LEGAL_SHELL('Privacy Policy', `
  <p class="legal-eyebrow">Legal</p>
  <h1 class="legal-title">Privacy Policy</h1>
  <p class="legal-meta">Effective 5 June 2026 · Version 1.0</p>
  <hr class="legal-rule" />

  <p class="legal-lead">
    Quorum is a private decision intelligence tool. We take the confidentiality of your
    decisions seriously. This policy explains exactly what data we collect, why we collect
    it, how it is protected, and what rights you have over it.
  </p>

  <div class="legal-section">
    <h2>1. Data we collect</h2>
    <div class="legal-table">
      <div class="legal-table-row"><div class="legal-table-key">Account data</div><div class="legal-table-val">Your email address, collected when you sign in via magic link.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Decision data</div><div class="legal-table-val">The decision text you submit and any register-mode answers you provide before Council analysis.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Analysis data</div><div class="legal-table-val">AI-generated responses from persona analysis, synthesis, and the Examiner diagnostic, stored so you can return to a session.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Behavioural data</div><div class="legal-table-val">Bias scores, calibration records, decision patterns, and independence metrics derived from your decisions over time. This compounds into your decision profile in the Mirror module.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Technical data</div><div class="legal-table-val">An anonymous device identifier (gated behind functional cookie consent), session identifiers, and server-side request logs including IP address and user agent.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Website enquiry</div><div class="legal-table-val">If you request early access via this website, your name, email, WhatsApp number, and the decision context you provide.</div></div>
    </div>
  </div>

  <div class="legal-section">
    <h2>2. Legal basis for processing</h2>
    <div class="legal-table">
      <div class="legal-table-row"><div class="legal-table-key">Contract</div><div class="legal-table-val">Creating and delivering a Council session, linking sessions to your account, and providing subscribed features.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Legitimate interests</div><div class="legal-table-val">Maintaining anonymous session access, improving reliability and product quality, and detecting abuse.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Consent</div><div class="legal-table-val">Functional cookies (device ID, session history). You may withdraw at any time via the Privacy Center in the app.</div></div>
    </div>
  </div>

  <div class="legal-section">
    <h2>3. AI processing</h2>
    <p>When you submit a decision for Council analysis, your decision text is transmitted to an AI processing service to generate the analysis. The AI provider processes your data solely to generate the response and does not use your submissions to train its models.</p>
    <p>Analysis generated by AI is for informational and reflective purposes only. It does not constitute legal, financial, medical, or investment advice.</p>
  </div>

  <div class="legal-section">
    <h2>4. Third-party processors</h2>
    <div class="legal-table">
      <div class="legal-table-row"><div class="legal-table-key">Supabase</div><div class="legal-table-val">Database and authentication. Hosted in the United States. See supabase.com/privacy.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Railway</div><div class="legal-table-val">Application hosting. Hosted in the United States. See railway.app/legal/privacy.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">AI service</div><div class="legal-table-val">Generates Council analysis from your decision text. Hosted in the United States.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Google Fonts</div><div class="legal-table-val">Loads typefaces. No personal data transmitted beyond standard browser request metadata.</div></div>
    </div>
  </div>

  <div class="legal-section">
    <h2>5. Data retention</h2>
    <div class="legal-table">
      <div class="legal-table-row"><div class="legal-table-key">Authenticated sessions</div><div class="legal-table-val">Retained until you delete your account or request erasure.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Anonymous sessions</div><div class="legal-table-val">Retained for 90 days if not linked to an account.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Bias &amp; behavioural profiles</div><div class="legal-table-val">Retained while your account is active. Deleted on account erasure.</div></div>
      <div class="legal-table-row"><div class="legal-table-key">Server logs</div><div class="legal-table-val">Standard infrastructure logs retained for up to 30 days.</div></div>
    </div>
  </div>

  <div class="legal-section">
    <h2>6. Data security</h2>
    <p>Decision text and analysis stored in the database is encrypted at rest using AES-256-GCM field-level encryption. All data in transit is protected by HTTPS/TLS. Authentication uses passwordless magic links — no passwords are stored. Row-level security is enforced in the database so each user's data is scoped to their account.</p>
    <p>For a full account of our security measures, see the <a href="/security">Security &amp; Trust</a> page.</p>
  </div>

  <div class="legal-section">
    <h2>7. Your rights</h2>
    <p>Under GDPR and the Digital Personal Data Protection Act 2023 (DPDP), you have the right to access, export, correct, erase, and restrict processing of your data. You may also withdraw consent and lodge a complaint with your supervisory authority.</p>
    <p>To exercise these rights, use the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a> in app Settings. We aim to respond within 30 days.</p>
  </div>

  <div class="legal-section">
    <h2>8. Cookies and local storage</h2>
    <p>Quorum uses browser local storage (not traditional HTTP cookies) to persist preferences on your device. For a full list of every key stored, its purpose, and how to manage it, see the <a href="/cookies">Cookie Policy</a>.</p>
  </div>

  <div class="legal-section">
    <h2>9. Children</h2>
    <p>Quorum is intended for professionals making significant decisions. We do not knowingly collect data from anyone under 18.</p>
  </div>

  <div class="legal-section">
    <h2>10. Changes &amp; contact</h2>
    <p>Material changes will be posted here with an updated effective date. To raise a privacy concern or exercise your rights, use the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a> in the app.</p>
  </div>
`)))

/* ── Terms of Service ─────────────────────────────────────────────── */
app.get('/terms', (_req, res) => res.send(LEGAL_SHELL('Terms of Service', `
  <p class="legal-eyebrow">Legal</p>
  <h1 class="legal-title">Terms of Service</h1>
  <p class="legal-meta">Effective 5 June 2026 · Version 1.0</p>
  <hr class="legal-rule" />

  <p class="legal-lead">By using Quorum, you agree to these terms. Please read them carefully —
    in particular the AI disclaimer in Section 4 and the limitation of liability in Section 9.</p>

  <div class="legal-section">
    <h2>1. What Quorum is</h2>
    <p>Quorum is a private decision intelligence platform that uses AI to simulate a structured advisory council for high-stakes personal and professional decisions. Access is via the web application at app.quorumvault.org.</p>
  </div>

  <div class="legal-section">
    <h2>2. Your account</h2>
    <p>Authentication uses passwordless magic links sent to your email. You are responsible for maintaining access to that email account and for all activity under your Quorum account. You must provide accurate information and must not share access with others.</p>
  </div>

  <div class="legal-section">
    <h2>3. Your data — you own it</h2>
    <p>You retain full ownership of the decisions you submit and the outputs generated in response. We do not claim any intellectual property rights over your decision content or the AI-generated analysis of it.</p>
    <p>We do not sell your data, share it with advertisers, or use it for any purpose other than providing Quorum to you. See the <a href="/privacy">Privacy Policy</a> for details.</p>
  </div>

  <div class="legal-section">
    <h2>4. AI analysis — not professional advice</h2>
    <div class="legal-highlight">
      Analysis generated by Quorum is produced by an AI system and is provided for informational
      and reflective purposes only. It does not constitute legal, financial, medical, investment,
      psychological, or any other form of professional advice. You should always apply your own
      judgment and, where appropriate, consult a qualified professional before making significant
      decisions. Quorum accepts no liability for decisions made in reliance on its analysis.
    </div>
    <p>AI analysis may contain errors or omissions. The quality of analysis depends on the context you provide.</p>
  </div>

  <div class="legal-section">
    <h2>5. Acceptable use</h2>
    <p>You may use Quorum for personal, professional, and business decision-making. You may not:</p>
    <ul>
      <li>Use Quorum for any unlawful purpose or in violation of any applicable law</li>
      <li>Submit content that is defamatory, threatening, or infringes third-party rights</li>
      <li>Attempt to reverse-engineer, scrape, or extract data from the platform at scale</li>
      <li>Resell or sublicense access to Quorum without a written agreement with us</li>
      <li>Use the service in a way that interferes with other users or our infrastructure</li>
    </ul>
  </div>

  <div class="legal-section">
    <h2>6. Subscriptions and payment</h2>
    <p>Certain features require a paid subscription. Subscriptions renew automatically unless cancelled. You may cancel at any time; cancellation takes effect at the end of the current billing period. No refunds are issued for partial periods unless required by applicable law.</p>
  </div>

  <div class="legal-section">
    <h2>7. Availability and changes</h2>
    <p>We aim to provide reliable access to Quorum but do not guarantee uninterrupted availability. We may modify, suspend, or discontinue features at any time, with reasonable notice where practicable.</p>
  </div>

  <div class="legal-section">
    <h2>8. Intellectual property</h2>
    <p>Quorum — including the software, design, personas, ontology system, and all product elements — is our proprietary intellectual property. Nothing in these terms grants you any rights to our technology beyond the right to use the service as described here.</p>
  </div>

  <div class="legal-section">
    <h2>9. Limitation of liability</h2>
    <p>To the maximum extent permitted by law, Quorum shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service. Our total aggregate liability shall not exceed the greater of (a) the amount you paid us in the prior 12 months or (b) ₹5,000 INR.</p>
  </div>

  <div class="legal-section">
    <h2>10. Governing law</h2>
    <p>These terms are governed by the laws of India. Disputes shall be subject to the exclusive jurisdiction of courts in India.</p>
  </div>

  <div class="legal-section">
    <h2>11. Changes &amp; contact</h2>
    <p>We may update these terms from time to time. Continued use after changes constitutes acceptance. Questions? Use the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a> in the app.</p>
  </div>
`)))

/* ── Cookie Policy ────────────────────────────────────────────────── */
app.get('/cookies', (_req, res) => res.send(LEGAL_SHELL('Cookie Policy', `
  <p class="legal-eyebrow">Legal</p>
  <h1 class="legal-title">Cookie Policy</h1>
  <p class="legal-meta">Effective 5 June 2026 · Version 1.0</p>
  <hr class="legal-rule" />

  <p class="legal-lead">
    Quorum does not use traditional HTTP cookies. Instead, we use browser
    <strong>local storage</strong> — a similar technology that stores small pieces of data
    in your browser. This page lists every key we store, what it contains, and how to manage it.
  </p>

  <div class="legal-section">
    <h2>Local storage registry</h2>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">quorum_cookie_consent</code>
        <span class="cookie-badge badge-necessary">Strictly Necessary</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">Records your cookie consent choices (necessary, functional, analytics). Required to respect your preferences across visits.</p>
        <p class="cookie-card-duration">Duration: Until manually cleared</p>
      </div>
    </div>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">quorum_theme</code>
        <span class="cookie-badge badge-necessary">Strictly Necessary</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">Remembers your light / dark mode preference so the interface loads in your chosen theme without a flash.</p>
        <p class="cookie-card-duration">Duration: Until manually cleared</p>
      </div>
    </div>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">quorum_user_email</code>
        <span class="cookie-badge badge-auth">Authentication</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">Persists your email address after signing in so the interface can recognise you across page loads without a fresh session check.</p>
        <p class="cookie-card-duration">Duration: Until you sign out or clear storage</p>
      </div>
    </div>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">quorum_device_id</code>
        <span class="cookie-badge badge-functional">Functional — consent required</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">An anonymous identifier generated on your device. Used to group decision sessions created before you sign in, so history is preserved at sign-up.</p>
        <p class="cookie-card-duration">Duration: Until manually cleared</p>
      </div>
    </div>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">quorum_session_ids</code>
        <span class="cookie-badge badge-functional">Functional — consent required</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">A local list of decision session IDs created on this device. Allows the home screen to show your recent decisions without a server request.</p>
        <p class="cookie-card-duration">Duration: Until manually cleared</p>
      </div>
    </div>

    <div class="cookie-card">
      <div class="cookie-card-head">
        <code class="cookie-card-key">sb-*-auth-token</code>
        <span class="cookie-badge badge-auth">Authentication</span>
      </div>
      <div class="cookie-card-body">
        <p class="cookie-card-purpose">Supabase authentication session token. Maintains your signed-in state across browser sessions.</p>
        <p class="cookie-card-duration">Duration: Per Supabase session defaults</p>
      </div>
    </div>
  </div>

  <div class="legal-section">
    <h2>Analytics</h2>
    <p>Quorum does not currently use any third-party analytics, advertising trackers, or cross-site tracking technologies. The analytics toggle in your consent preferences is reserved for potential future use and is off by default.</p>
  </div>

  <div class="legal-section">
    <h2>Managing your preferences</h2>
    <p>You can update your consent choices at any time via the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a> in app Settings. Revoking functional consent means new session IDs and device identifiers will no longer be written to your device. Previously created sessions remain accessible via their direct URL.</p>
  </div>
`)))

/* ── Security & Trust ─────────────────────────────────────────────── */
app.get('/security', (_req, res) => res.send(LEGAL_SHELL('Security & Trust', `
  <p class="legal-eyebrow">Legal</p>
  <h1 class="legal-title">Security &amp; Trust</h1>
  <p class="legal-meta">Effective 5 June 2026 · Current state — no aspirational claims</p>
  <hr class="legal-rule" />

  <p class="legal-lead">
    This page lists only what is technically implemented today. We do not list
    aspirational measures or certifications we have not yet completed.
  </p>

  <div class="legal-section">
    <h2>What we do today</h2>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>AES-256-GCM field encryption at rest</h3>
        <p>Decision text and AI analysis stored in the database are encrypted at the field level using AES-256-GCM before storage. Encrypted fields are decrypted only at read time within the application.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>Passwordless magic link authentication</h3>
        <p>Quorum uses time-limited magic links sent to your email. No passwords are stored. Authentication is handled via Supabase Auth with PKCE flow.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>HTTPS / TLS in transit</h3>
        <p>All data between your browser and Quorum servers is transmitted over HTTPS with TLS termination enforced at the hosting layer.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>Row-level security on the database</h3>
        <p>Supabase PostgreSQL row-level security policies are enforced across all user-scoped tables. Authenticated users can only read and write their own rows.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>US-based hosting infrastructure</h3>
        <p>The Quorum application runs on Railway (US) and the database is hosted on Supabase (US). No user data is stored in jurisdictions with inadequate data protection standards.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>No advertising, no data selling</h3>
        <p>Quorum does not serve advertising, does not sell user data, and does not share decision content with any third party except the AI processing service used to generate analysis.</p>
      </div>
    </div>

    <div class="security-row">
      <div class="security-check">✓</div>
      <div class="security-row-content">
        <h3>AI processing with no training use</h3>
        <p>Your decision text is processed by an AI service solely to generate your Council analysis. The AI provider does not use your submissions to train its models.</p>
      </div>
    </div>
  </div>

  <div class="legal-section">
    <h2>What we do not yet have</h2>
    <p>We believe transparency about current limitations is more valuable than unverifiable claims. The following are not yet in place:</p>
    <div class="cookie-card" style="margin-top:10px;">
      ${['SOC 2 Type II certification','Independent penetration testing','Multi-factor authentication (MFA)','Automated encryption key rotation','Dedicated security operations centre','Vulnerability disclosure programme'].map(item =>
        `<div style="display:flex;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid var(--b0);">
          <div class="security-cross">–</div>
          <span style="font-size:13px;color:var(--t4);">${item}</span>
        </div>`
      ).join('')}
    </div>
  </div>

  <div class="legal-section">
    <h2>Reporting a security concern</h2>
    <p>If you discover a potential security issue, please report it via the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a> in app Settings. We will acknowledge all valid reports within 5 business days and aim to remediate critical issues within 30 days.</p>
  </div>

  <div class="legal-section">
    <h2>Your data rights</h2>
    <p>You can export or delete your data at any time via the <a href="${APP_URL}/settings/privacy" target="_blank" rel="noopener">Privacy Center</a>. For full details see the <a href="/privacy">Privacy Policy</a>.</p>
  </div>
`)))

/* ── Fallback → index.html ────────────────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

/* ── Start ────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`[Quorum Website] Listening on port ${PORT}`)
})
