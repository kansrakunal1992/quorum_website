/**
 * waitlist-fields.js — pure helpers for POST /api/waitlist.
 * ─────────────────────────────────────────────────────────────────────
 * No Express, no environment: server.js passes in the request body and a Supabase client, so everything here can be
 * unit-tested without a database (see tests/waitlist-fields.test.mjs).
 *
 * What it does
 *   1. Validates the three fields the form has always required (interest_type, name, email).
 *   2. Cleans the founder-qualification fields added in v18 (company, role, size, decisions per quarter, review
 *      process, UTMs, the button that opened the form). Unknown or malformed values are dropped to null rather than
 *      rejected: losing a lead over an optional field costs more than a missing field.
 *   3. Saves the row. If the database does not have the new columns yet (migration not run), it retries with the
 *      legacy columns only and appends the qualification as plain text to additional_context, so deploying this
 *      file BEFORE add_session_requests_founder_fields.sql never breaks the form and never loses the answers.
 */

export const SEGMENTS = ['founder', 'feeder', 'champion', 'institution', 'exploring']
// Values an older, cached copy of the page may still send.
export const LEGACY_INTEREST = ['private', 'explore', 'other']

export const ROLES = {
  founder_ceo: 'Founder / CEO',
  coo_cos_strategy: 'COO / Chief of Staff / Strategy',
  other_leadership: 'Other leadership',
  other: 'Other',
}
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '200+']
export const DECISIONS_PER_QUARTER = ['1-2', '3-5', '6+']
export const REVIEW_PROCESS = { no: 'No', informal: 'Informally', yes: 'Yes' }

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trimmed string capped at `max`, or null for anything that is not a non-empty string. */
export function cleanText(v, max = 200) {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t === '' ? null : t
}

const oneOf = (v, allowed) => (typeof v === 'string' && allowed.includes(v.trim()) ? v.trim() : null)

/**
 * @returns {{ ok: false, error: string } | { ok: true, legacy: object, extended: object, qualification: string }}
 */
export function parseWaitlistBody(body) {
  const b = body && typeof body === 'object' ? body : {}

  const interest = cleanText(b.interest_type, 40)
  if (!interest) return { ok: false, error: 'interest_type is required' }
  if (!SEGMENTS.includes(interest) && !LEGACY_INTEREST.includes(interest)) {
    return { ok: false, error: 'interest_type is not recognised' }
  }

  const name = cleanText(b.name, 200)
  if (!name) return { ok: false, error: 'name is required' }

  const email = cleanText(b.email, 320)
  if (!email || !EMAIL_RX.test(email)) return { ok: false, error: 'A valid email address is required' }

  // Exactly what the table has always held.
  const legacy = {
    interest_type: interest,
    decision_summary: cleanText(b.decision_summary, 4000),
    name,
    email: email.toLowerCase(),
    whatsapp: cleanText(b.whatsapp, 40),
    additional_context: cleanText(b.additional_context, 4000),
  }

  // New in v18. `segment` is derived from interest_type here, not trusted from the client.
  const extra = {
    company: cleanText(b.company, 120),
    role: oneOf(b.role, Object.keys(ROLES)),
    company_size: oneOf(b.company_size, COMPANY_SIZES),
    decisions_per_quarter: oneOf(b.decisions_per_quarter, DECISIONS_PER_QUARTER),
    has_review_process: oneOf(b.has_review_process, Object.keys(REVIEW_PROCESS)),
    segment: SEGMENTS.includes(interest) ? interest : null,
    utm_source: cleanText(b.utm_source, 200),
    utm_medium: cleanText(b.utm_medium, 200),
    utm_campaign: cleanText(b.utm_campaign, 200),
    utm_content: cleanText(b.utm_content, 200),
    cta: cleanText(b.cta, 100),
  }

  return { ok: true, legacy, extended: { ...legacy, ...extra }, qualification: qualificationText(extra) }
}

/** Human-readable block that carries the new answers when the new columns do not exist yet. */
export function qualificationText(extra) {
  const lines = []
  if (extra.segment) lines.push(`segment: ${extra.segment}`)
  if (extra.company) lines.push(`company: ${extra.company}`)
  if (extra.role) lines.push(`role: ${ROLES[extra.role]}`)
  if (extra.company_size) lines.push(`company size: ${extra.company_size}`)
  if (extra.decisions_per_quarter) lines.push(`decisions per quarter: ${extra.decisions_per_quarter}`)
  if (extra.has_review_process) lines.push(`structured decision review today: ${REVIEW_PROCESS[extra.has_review_process]}`)
  const src = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].filter(k => extra[k]).map(k => `${k}=${extra[k]}`)
  if (src.length) lines.push(`source: ${src.join(' ')}`)
  if (extra.cta) lines.push(`opened from: ${extra.cta}`)
  return lines.length ? `[qualification]\n${lines.join('\n')}` : ''
}

/** True when Postgres / PostgREST says a column in the insert does not exist (migration not run yet). */
export function isMissingColumnError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === '42703' || // Postgres: undefined_column
    error.code === 'PGRST204' || // PostgREST: column not found in the schema cache
    /could not find the '.+' column/i.test(msg) ||
    /column .+ (of relation .+ )?does not exist/i.test(msg)
  )
}

/**
 * Insert with the new columns; on a missing-column error, retry once with the legacy columns plus the qualification
 * appended to additional_context. Returns `{ error, usedFallback }`.
 */
export async function saveSessionRequest(supabase, parsed) {
  const first = await supabase.from('session_requests').insert(parsed.extended)
  if (!first.error || !isMissingColumnError(first.error)) return { error: first.error || null, usedFallback: false }

  const merged = [parsed.legacy.additional_context, parsed.qualification].filter(Boolean).join('\n\n')
  const second = await supabase
    .from('session_requests')
    .insert({ ...parsed.legacy, additional_context: merged ? merged.slice(0, 8000) : null })
  return { error: second.error || null, usedFallback: true }
}
