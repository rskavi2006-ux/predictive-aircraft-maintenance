import jwt from 'jsonwebtoken';
import { verifyCredentials, type PublicUser } from '../users/users.service.js';
import { jwtSecret } from './auth.config.js';

// Access token only for now (8h). Refresh-token rotation is a planned follow-up.
export async function login(
  username: string,
  password: string,
): Promise<{ token: string; user: PublicUser } | null> {
  const user = await verifyCredentials(username, password);
  if (!user) return null;
  const token = jwt.sign(
    { name: user.name, role: user.role, lic: user.licenseCategory },
    jwtSecret(),
    { subject: user.id, expiresIn: '8h' },
  );
  return { token, user };
}