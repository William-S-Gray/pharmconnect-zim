import { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Parse `data` against `schema`, converting a Zod failure into a 400 with
 * per-field messages the forms can display inline.
 *
 * Validation happens at the edge of every route rather than being trusted
 * from the client. Under the old architecture the browser wrote to
 * Postgres directly and CHECK constraints were the only thing standing
 * behind the React form; here the constraints remain as a backstop but the
 * readable error comes from this layer.
 */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      details[key] ??= issue.message;
    }
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

export const email = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  // Stored and compared lowercased; the unique index is on LOWER(email),
  // so normalising here keeps reads and writes agreeing.
  .transform((v) => v.toLowerCase());

// Length is the property that actually resists guessing; composition rules
// mostly push people toward predictable substitutions. The upper bound
// exists because scrypt hashes whatever it is given and a multi-megabyte
// password is a cheap way to burn server CPU.
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password must be at most 200 characters');

export const uuid = z.string().uuid('Expected a valid id');

/**
 * A single-line name. Rejects control characters, which have no place in a
 * pharmacy or person's name and are the raw material for header-injection
 * attempts once the value reaches an email subject.
 */
export const displayName = (max = 160) =>
  z.string().trim().min(1).max(max)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Must not contain line breaks or control characters');

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export { z };
