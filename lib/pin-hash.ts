import bcrypt from 'bcryptjs'

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10)
}

export function verifyPin(pin: string, hash: string): boolean {
  return bcrypt.compareSync(pin, hash)
}
