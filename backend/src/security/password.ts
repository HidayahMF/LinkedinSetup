import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

const KEY_LENGTH = 64
const SCRYPT_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 }

function scryptDerive(
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err)
      else resolve(derived)
    })
  })
}

/** Hash format: `scrypt$N$r$p$saltHex$hashHex` (self-describing, params stored). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptDerive(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT_PARAMS)
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts
  const N = Number.parseInt(nRaw, 10)
  const r = Number.parseInt(rRaw, 10)
  const p = Number.parseInt(pRaw, 10)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltHex, 'hex')
    expected = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false
  const derived = await scryptDerive(password.normalize('NFKC'), salt, expected.length, { N, r, p })
  return timingSafeEqual(derived, expected)
}
