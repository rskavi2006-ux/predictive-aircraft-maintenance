import bcrypt from 'bcryptjs';
import type { LicenseCategory, Role } from '@aeroguard/shared';
import { envelope } from '../../common/pagination.js';
import { AppError } from '../../middleware/errorHandler.js';
import { UserModel } from './user.model.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  licenseCategory?: LicenseCategory;
  isActive: boolean;
}

interface UserDoc {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  licenseCategory?: string | null;
  isActive: boolean;
}

// Never expose passwordHash.
function toPublic(u: UserDoc): PublicUser {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    licenseCategory: (u.licenseCategory ?? undefined) as LicenseCategory | undefined,
    isActive: u.isActive,
  };
}

// Used so a wrong email takes about as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface NewUser {
  name: string;
  email: string;
  password: string;
  role: Role;
  licenseCategory?: LicenseCategory;
}

export async function createUser(input: NewUser): Promise<PublicUser> {
  if (await UserModel.exists({ email: input.email.toLowerCase() })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const doc = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    licenseCategory: input.licenseCategory,
  });
  return toPublic(doc);
}

// Returns null for wrong password, unknown email or a deactivated user.
export async function verifyCredentials(email: string, password: string): Promise<PublicUser | null> {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) return null;
  return toPublic(user);
}

export async function getActiveUser(id: string): Promise<PublicUser | null> {
  const user = await UserModel.findById(id);
  return user && user.isActive ? toPublic(user) : null;
}

export async function listUsers(page: number, limit: number) {
  const [docs, total] = await Promise.all([
    UserModel.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    UserModel.countDocuments(),
  ]);
  return envelope(docs.map((d) => toPublic(d)), page, limit, total);
}

export async function updateUser(id: string, patch: { name?: string; isActive?: boolean }) {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  const before = toPublic(user);
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.isActive !== undefined) user.isActive = patch.isActive;
  await user.save();
  return { before, after: toPublic(user) };
}