const activeOTPs = new Map();
export function generateOTP(userId) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  activeOTPs.set(code, { userId, expires: Date.now() + 5 * 60 * 1000 });
  return code;
}
export function verifyOTP(code) {
  const entry = activeOTPs.get(code);
  if (!entry) return false;
  if (Date.now() > entry.expires) { activeOTPs.delete(code); return false; }
  activeOTPs.delete(code);
  return true;
}
