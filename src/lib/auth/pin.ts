import bcrypt from 'bcryptjs';

export const PIN_PATTERN = /^\d{4,8}$/;

function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4–8 digits');
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return bcrypt.compare(pin, hash);
}
