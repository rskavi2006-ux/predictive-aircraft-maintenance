import { Schema, model } from 'mongoose';
import { LICENSE_CATEGORIES, ROLES } from '@aeroguard/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true }, // optional contact email
    passwordHash: { type: String, required: true },
    role: { type: String, enum: [...ROLES], required: true },
    licenseCategory: { type: String, enum: [...LICENSE_CATEGORIES] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
// Unique when present; users without an email do not collide.
userSchema.index({ email: 1 }, { unique: true, sparse: true });

export const UserModel = model('User', userSchema);