/** Browser-safe identifiers. The backend can later become the authoritative ID generator. */
export function createEntityId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${secureRandomToken(8)}`;

  return `${prefix}-${uuid}`;
}

export function createSequentialCode(prefix: string, nextNumber: number, width = 4): string {
  return `${prefix}-${String(Math.max(1, nextNumber)).padStart(width, '0')}`;
}

export function createBarcode(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = secureRandomNumber(1000, 9999);
  return `890${timestamp}${random}`;
}

function secureRandomToken(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  }
  return Array.from({ length }, (_, index) => alphabet[(Date.now() + index * 31) % alphabet.length]).join('');
}

function secureRandomNumber(min: number, max: number): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return min + (values[0] % (max - min + 1));
  }
  return min + (Date.now() % (max - min + 1));
}
