import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

export const OTP_LENGTH = 6;

export const generateOtpCode = (): string => {
  const code = randomInt(0, 10 ** OTP_LENGTH);
  return code.toString().padStart(OTP_LENGTH, '0');
};

export const hashOtpCode = async (code: string): Promise<string> => {
  return bcrypt.hash(code, 10);
};

export const verifyOtpCode = async (
  code: string,
  codeHash: string
): Promise<boolean> => {
  return bcrypt.compare(code, codeHash);
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
