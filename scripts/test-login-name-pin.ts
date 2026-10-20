import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('components/auth/LoginClient.tsx', 'utf8')

assert.match(source, />name<\/span>/i, 'Login form must label the account field as name.')
assert.match(source, /name="username"/, 'Login form must submit a username field.')
assert.match(source, />pin<\/span>/i, 'Login form must label the secret field as PIN.')
assert.match(source, /name="pin"/, 'Login form must submit a PIN field.')
assert.match(source, /inputMode="numeric"/, 'PIN input must use the numeric keypad.')
assert.match(source, /maxLength=\{6\}/, 'PIN input must be limited to six digits.')
assert.match(source, /pattern="\[0-9\]\{6\}"/, 'PIN input must require exactly six digits.')
assert.match(source, /JSON\.stringify\(\{[\s\S]*?username:\s*username\.trim\(\),\s*pin,?\s*\}\)/, 'Login request must contain only username and PIN.')

assert.doesNotMatch(source, /name="email"/, 'Login form must not request email.')
assert.doesNotMatch(source, /name="password"/, 'Login form must not request a password.')
assert.doesNotMatch(source, /type="email"/, 'Login form must not render an email input.')

console.log('PASS login form is name and six-digit PIN only')
