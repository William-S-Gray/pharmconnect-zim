import { z } from 'zod';

/**
 * Shared validation rules to prevent oversized or malformed input
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .min(5, 'Email is too short')
  .max(100, 'Email is too long')
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long (max 72 characters for security)')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Login Form Schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});

/**
 * Pharmacy Registration Schema
 */
export const pharmacyRegisterSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(100).trim(),
  email: emailSchema,
  phone: z.string().min(8, 'Phone number is too short').max(20).trim(),
  city: z.string().min(2, 'City is required').max(50).trim(),
  suburb: z.string().min(2, 'Suburb is required').max(50).trim(),
  address: z.string().min(5, 'Physical address is required').max(200).trim(),
  mcazLicense: z.string().max(50).trim().optional().or(z.literal('')),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

/**
 * Generic string sanitizer for potentially malicious input
 * Use this for free-text fields like descriptions or names
 */
export const sanitizeString = (val: string) => {
  return val
    .replace(/[<>]/g, '') // Basic tag removal
    .trim();
};
