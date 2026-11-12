import { describe, it, expect } from 'vitest';
import {
  userSignupSchema,
  userLoginSchema,
  otpSchema,
  addToCartSchema,
  sanitizeInput,
} from '../utils/validation';

// ── Sign-up schema ────────────────────────────────────────────────────
describe('userSignupSchema', () => {
  const validUser = {
    email: 'john@example.com',
    password: 'StrongP@ss123!',
    fullName: 'John Doe',
    role: 'user' as const,
  };

  it('accepts valid input', () => {
    const result = userSignupSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = userSignupSchema.safeParse({ ...validUser, email: 'notanemail' });
    expect(result.success).toBe(false);
  });

  it('rejects weak password (too short)', () => {
    const result = userSignupSchema.safeParse({ ...validUser, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = userSignupSchema.safeParse({ ...validUser, password: 'alllowercase1!' });
    expect(result.success).toBe(false);
  });

  it('rejects password without special character', () => {
    const result = userSignupSchema.safeParse({ ...validUser, password: 'NoSpecialChar123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = userSignupSchema.safeParse({ ...validUser, role: 'superadmin' });
    expect(result.success).toBe(false);
  });

  it('rejects name with numbers', () => {
    const result = userSignupSchema.safeParse({ ...validUser, fullName: 'John123' });
    expect(result.success).toBe(false);
  });

  it('accepts name with hyphens and apostrophes', () => {
    const result = userSignupSchema.safeParse({ ...validUser, fullName: "O'Brien-Smith" });
    expect(result.success).toBe(true);
  });
});

// ── Login schema ──────────────────────────────────────────────────────
describe('userLoginSchema', () => {
  it('accepts valid login', () => {
    const result = userLoginSchema.safeParse({ email: 'user@example.com', password: 'any' });
    expect(result.success).toBe(true);
  });

  it('rejects empty password', () => {
    const result = userLoginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

// ── OTP schema ────────────────────────────────────────────────────────
describe('otpSchema', () => {
  it('accepts 6-digit OTP', () => {
    expect(otpSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejects 5-digit OTP', () => {
    expect(otpSchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects alphabetic characters', () => {
    expect(otpSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});

// ── Cart schema ───────────────────────────────────────────────────────
describe('addToCartSchema', () => {
  it('accepts valid cart item', () => {
    const result = addToCartSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      quantity: 2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects quantity 0', () => {
    const result = addToCartSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity > 99', () => {
    const result = addToCartSchema.safeParse({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      quantity: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID productId', () => {
    const result = addToCartSchema.safeParse({
      productId: 'not-a-uuid',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ── Sanitize ──────────────────────────────────────────────────────────
describe('sanitizeInput', () => {
  it('removes < and > characters', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('truncates long strings to 10000 chars', () => {
    const long = 'a'.repeat(15000);
    expect(sanitizeInput(long).length).toBe(10000);
  });
});
