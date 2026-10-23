import bcrypt from 'bcryptjs';
import type { LicenseCategory, Role } from '@aeroguard/shared';
import { envelope } from '../../common/pagination.js';
import { AppError } from '../../middleware/errorHandler.js';
import { UserModel } from './user.model.js';

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: Role;
  licenseCategory?: LicenseCategory;
  isActive: boolean;
}

interface UserDoc {
  _id: unknown;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  licenseCategory?: string | null;
  isActive: boolean;
}

// Never expose passwordHash.
function toPublic(u: UserDoc): PublicUser {
  return {
    id: String(u._id),
    name: u.name,
    username: u.username,
    email: u.email ?? undefined,
    role: u.role as Role,
    licenseCategory: (u.licenseCategory ?? undefined) as LicenseCategory | undefined,
    isActive: u.isActive,
  };
}

// Used so an unknown username takes about as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface NewUser {
  name: string;
  username: string;
  email?: string;
  password: string;
  role: Role;
  licenseCategory?: LicenseCategory;
}

export async function createUser(input: NewUser): Promise<PublicUser> {
  const username = input.username.toLowerCase();
  if (await UserModel.exists({ username })) {
    throw new AppError(409, 'USERNAME_TAKEN', 'This username is already in use');
  }
  if (input.email && (await UserModel.exists({ email: input.email.toLowerCase() }))) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const doc = await UserModel.create({
    name: input.name,
    username,
    email: input.email,
    passwordHash,
    role: input.role,
    licenseCategory: input.licenseCategory,
  });
  return toPublic(doc);
}

// Returns null for a wrong password, unknown username or a deactivated user.
export async function verifyCredentials(username: string, password: string): Promise<PublicUser | null> {
  const user = await UserModel.findOne({ username: username.trim().toLowerCase() });
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

export interface UserPatch {
  name?: string;
  isActive?: boolean;
  role?: Role;
  licenseCategory?: LicenseCategory;
}

export async function updateUser(id: string, patch: UserPatch) {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  const before = toPublic(user);

  // Never let the system end up without an active Admin.
  const losesAdminRole = patch.role !== undefined && patch.role !== 'ADMIN';
  const getsDeactivated = patch.isActive === false;
  if (before.role === 'ADMIN' && (losesAdminRole || getsDeactivated)) {
    const others = await UserModel.countDocuments({ role: 'ADMIN', isActive: true, _id: { $ne: user._id } });
    if (others === 0) throw new AppError(409, 'LAST_ADMIN', 'At least one active Admin must remain');
  }

  if (patch.name !== undefined) user.name = patch.name;
  if (patch.isActive !== undefined) user.isActive = patch.isActive;
  if (patch.role !== undefined) user.role = patch.role;

  // Only engineers carry a licence category (B1 or B2), and an engineer must have one.
  if (user.role === 'ENGINEER') {
    const lic = patch.licenseCategory ?? before.licenseCategory;
    if (!lic) throw new AppError(400, 'VALIDATION_ERROR', 'licenseCategory (B1 or B2) is required for ENGINEER');
    user.licenseCategory = lic;
  } else {
    user.licenseCategory = undefined;
  }

  await user.save();
  return { before, after: toPublic(user) };
}