/**
 * AES-256-GCM encryption for storing Naukri credentials safely
 * Uses Node.js built-in crypto — no external deps needed
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16  // 128 bits
const TAG_LENGTH = 16 // 128 bits

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex || keyHex.length < 64) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Generate: openssl rand -hex 32')
  }
  return Buffer.from(keyHex.slice(0, 64), 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  // Format: iv(32hex) + tag(32hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decrypt(ciphertext: string): string {
  const key = getKey()

  if (ciphertext.length < 64) throw new Error('Invalid ciphertext')

  const iv = Buffer.from(ciphertext.slice(0, 32), 'hex')
  const tag = Buffer.from(ciphertext.slice(32, 64), 'hex')
  const encrypted = Buffer.from(ciphertext.slice(64), 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

export function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null
  try {
    return decrypt(ciphertext)
  } catch {
    return null
  }
}
