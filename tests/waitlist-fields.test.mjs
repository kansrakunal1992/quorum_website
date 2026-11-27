// Run with: node --test tests/waitlist-fields.test.mjs   (Node 18+, no dependencies)
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWaitlistBody, isMissingColumnError, saveSessionRequest, qualificationText } from '../waitlist-fields.js'

const base = { interest_type: 'founder', name: ' Asha ', email: ' ASHA@Example.com ', decision_summary: 'x'.repeat(90) }

test('requires interest_type, name and a valid email (same messages as before)', () => {
  assert.deepEqual(parseWaitlistBody({}), { ok: false, error: 'interest_type is required' })
  assert.equal(parseWaitlistBody({ ...base, name: '  ' }).error, 'name is required')
  assert.equal(parseWaitlistBody({ ...base, email: 'nope' }).error, 'A valid email address is required')
  assert.equal(parseWaitlistBody({ ...base, interest_type: 'hacker' }).error, 'interest_type is not recognised')
  assert.equal(parseWaitlistBody(null).ok, false)
  assert.equal(parseWaitlistBody('string').ok, false)
})

test('accepts every current segment and the three legacy values', () => {
  for (const v of ['founder', 'feeder', 'champion', 'institution', 'exploring', 'private', 'explore', 'other']) {
    assert.equal(parseWaitlistBody({ ...base, interest_type: v }).ok, true, v)
  }
})

test('legacy row has exactly the six original columns, trimmed, email lower-cased, empties null', () => {
  const p = parseWaitlistBody({ ...base, whatsapp: '', additional_context: undefined })
  assert.deepEqual(Object.keys(p.legacy), ['interest_type', 'decision_summary', 'name', 'email', 'whatsapp', 'additional_context'])
  assert.equal(p.legacy.name, 'Asha')
  assert.equal(p.legacy.email, 'asha@example.com')
  assert.equal(p.legacy.whatsapp, null)
  assert.equal(p.legacy.additional_context, null)
})

test('segment is derived from interest_type, never taken from the client', () => {
  assert.equal(parseWaitlistBody({ ...base, segment: 'champion' }).extended.segment, 'founder')
  assert.equal(parseWaitlistBody({ ...base, interest_type: 'private', segment: 'founder' }).extended.segment, null)
})

test('qualification values outside the allowed lists drop to null instead of rejecting the lead', () => {
  const p = parseWaitlistBody({
    ...base,
    role: 'king', company_size: '9000', decisions_per_quarter: 'lots', has_review_process: 'maybe',
    company: 12345, utm_source: { a: 1 }, cta: ['x'],
  })
  assert.equal(p.ok, true)
  for (const k of ['role', 'company_size', 'decisions_per_quarter', 'has_review_process', 'company', 'utm_source', 'cta']) {
    assert.equal(p.extended[k], null, k)
  }
})

test('valid qualification values and UTMs pass through; long text is capped', () => {
  const p = parseWaitlistBody({
    ...base, company: 'Acme '.repeat(100), role: 'founder_ceo', company_size: '11-50', decisions_per_quarter: '3-5',
    has_review_process: 'informal', utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'founder_q4', utm_content: 'post7',
    cta: 'cta_hero_pilot',
  })
  assert.equal(p.extended.role, 'founder_ceo')
  assert.equal(p.extended.company.length, 120)
  assert.equal(p.extended.utm_campaign, 'founder_q4')
  assert.equal(p.extended.cta, 'cta_hero_pilot')
})

test('qualificationText is readable and empty when there is nothing to say', () => {
  assert.equal(qualificationText({}), '')
  const t = qualificationText({ segment: 'founder', role: 'coo_cos_strategy', company_size: '51-200', utm_source: 'x', cta: 'cta_pilot' })
  assert.match(t, /^\[qualification\]/)
  assert.match(t, /role: COO \/ Chief of Staff \/ Strategy/)
  assert.match(t, /source: utm_source=x/)
  assert.match(t, /opened from: cta_pilot/)
})

test('isMissingColumnError recognises Postgres and PostgREST wording, and nothing else', () => {
  assert.equal(isMissingColumnError({ code: '42703', message: 'x' }), true)
  assert.equal(isMissingColumnError({ code: 'PGRST204', message: 'x' }), true)
  assert.equal(isMissingColumnError({ message: "Could not find the 'company' column of 'session_requests' in the schema cache" }), true)
  assert.equal(isMissingColumnError({ message: 'column "company" of relation "session_requests" does not exist' }), true)
  assert.equal(isMissingColumnError({ code: '23505', message: 'duplicate key' }), false)
  assert.equal(isMissingColumnError({ code: '42501', message: 'permission denied' }), false)
  assert.equal(isMissingColumnError(null), false)
})

function fakeClient(results) {
  const calls = []
  return { calls, from: table => ({ insert: async row => { calls.push({ table, row }); return { error: results.shift() ?? null } } }) }
}

test('saveSessionRequest: new columns present -> one insert with everything', async () => {
  const c = fakeClient([null])
  const parsed = parseWaitlistBody({ ...base, role: 'founder_ceo' })
  const r = await saveSessionRequest(c, parsed)
  assert.deepEqual(r, { error: null, usedFallback: false })
  assert.equal(c.calls.length, 1)
  assert.equal(c.calls[0].table, 'session_requests')
  assert.equal(c.calls[0].row.role, 'founder_ceo')
})

test('saveSessionRequest: columns missing -> retries with legacy columns and keeps the answers as text', async () => {
  const c = fakeClient([{ code: 'PGRST204', message: 'x' }, null])
  const parsed = parseWaitlistBody({ ...base, additional_context: 'Prefers WhatsApp', company: 'Acme', role: 'founder_ceo', utm_campaign: 'q4' })
  const r = await saveSessionRequest(c, parsed)
  assert.deepEqual(r, { error: null, usedFallback: true })
  assert.equal(c.calls.length, 2)
  const legacyRow = c.calls[1].row
  assert.deepEqual(Object.keys(legacyRow), ['interest_type', 'decision_summary', 'name', 'email', 'whatsapp', 'additional_context'])
  assert.match(legacyRow.additional_context, /^Prefers WhatsApp\n\n\[qualification\]/)
  assert.match(legacyRow.additional_context, /company: Acme/)
  assert.match(legacyRow.additional_context, /utm_campaign=q4/)
})

test('saveSessionRequest: any other database error is returned, not retried', async () => {
  const c = fakeClient([{ code: '23505', message: 'duplicate key' }])
  const r = await saveSessionRequest(c, parseWaitlistBody(base))
  assert.equal(r.error.code, '23505')
  assert.equal(r.usedFallback, false)
  assert.equal(c.calls.length, 1)
})

test('saveSessionRequest: a failing fallback surfaces its error', async () => {
  const c = fakeClient([{ code: '42703', message: 'x' }, { code: '42501', message: 'permission denied' }])
  const r = await saveSessionRequest(c, parseWaitlistBody(base))
  assert.equal(r.usedFallback, true)
  assert.equal(r.error.code, '42501')
})
