import { Schema, model } from 'mongoose';
import { LICENSE_CATEGORIES, ROLES } from '@aeroguard/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: [...ROLES], required: true },
    licenseCategory: { type: String, enum: [...LICENSE_CATEGORIES] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema);