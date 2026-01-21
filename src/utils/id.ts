/**
 * Generate a short, URL-safe document ID
 * 
 * Uses a custom alphabet that excludes confusing characters:
 * - No 0/O (zero/letter O)
 * - No 1/l/I (one/lowercase L/uppercase i)
 * 
 * 10 characters from 57-char alphabet = 57^10 ≈ 3.6 × 10^17 combinations
 * That's plenty of entropy to prevent guessing.
 */

// Custom alphabet without ambiguous characters
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const ID_LENGTH = 10;

/**
 * Generate a random document ID
 */
export function generateId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  
  return id;
}

/**
 * Validate a document ID format
 */
export function isValidId(id: string): boolean {
  if (id.length !== ID_LENGTH) return false;
  
  for (const char of id) {
    if (!ALPHABET.includes(char)) return false;
  }
  
  return true;
}
