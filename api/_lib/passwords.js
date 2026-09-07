import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

export async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// Hash bidon (mot de passe arbitraire, jamais utilisé pour un vrai compte) comparé quand l'email
// n'existe pas en base, pour que le temps de réponse du login ne permette pas de deviner par timing
// si un compte existe ou non (énumération d'utilisateurs).
const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8gGCzXsQ8AIm8NmyzHU4wI2XAV4/Ba';
export async function verifyAgainstDummy(pw) {
  return bcrypt.compare(pw, DUMMY_HASH);
}
