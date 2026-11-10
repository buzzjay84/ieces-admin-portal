const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
let handler, inserted = 0, created = 0, pageCalls = [];
let existing = true, validPassword = false, laterPage = false;
const admin = {
  from(table) {
    return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: table === 'report_allowed_users' ? { id: 'allowed' } : null }),
      insert: async () => { inserted++; return { error: null }; } };
  },
  auth: { admin: {
    listUsers: async ({ page }) => {
      pageCalls.push(page);
      return { data: { users: laterPage && page === 1 ? Array.from({ length: 1000 }, () => ({ email: 'another@example.invalid' })) : existing ? [{ id: 'owner', email: 'allowed@example.invalid' }] : [] } };
    },
    createUser: async options => { assert.equal(options.email_confirm, true); created++; return { data: { user: { id: 'new-user' } } }; },
  } },
};
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../supabase/functions/report-register/index.ts'), 'utf8')
  .replace('import { createClient } from "@supabase/supabase-js";', ''));
vm.runInNewContext(source, {
  Request, Response, console,
  Deno: { env: { get: name => name }, serve: callback => { handler = callback; } },
  createClient: (_url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? admin : { auth: {
    signInWithPassword: async () => validPassword ? { data: { user: { id: 'owner' } } } : { data: {}, error: { message: 'Wrong password' } },
  } },
});
const body = { email: 'allowed@example.invalid', password: 'test-password', username: 'teacher' };
const send = value => handler(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(value) }));
(async () => {
  assert.equal((await handler(new Request('https://example.invalid'))).status, 405);
  assert.equal((await handler(new Request('https://example.invalid', { method: 'POST', body: '{' }))).status, 400);
  for (const value of [null, [], { ...body, email: 7 }, { ...body, first_name: {} }, { ...body, password: 'x' }]) assert.equal((await send(value)).status, 400);
  assert.equal((await send(body)).status, 403);
  assert.equal(inserted, 0, 'Knowing an allowed email cannot attach a profile to its account');
  validPassword = true; laterPage = true; pageCalls = [];
  assert.equal((await send(body)).status, 200);
  assert.deepEqual(pageCalls, [1, 2], 'Accounts beyond the first 1000 are found');
  assert.equal(inserted, 1);
  existing = false; laterPage = false;
  assert.equal((await send(body)).status, 200);
  assert.equal(created, 1, 'Allowed new accounts register immediately without email confirmation');
  assert.equal(inserted, 2);
  console.log('PASS: registration methods, invalid JSON/types, password ownership, pagination, and immediate allowlisted registration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
