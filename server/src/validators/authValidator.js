import { body } from 'express-validator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


// Load the common password list ONCE at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMON_PASSWORD_PATH = path.join(__dirname, '../Common_Password.txt');
const COMMON_PASSWORDS = new Set(
  fs.readFileSync(COMMON_PASSWORD_PATH, 'utf8')
    .split('\n')
    .map(pw => pw.trim().toLowerCase())
);

const TEMP_EMAIL_DOMAINS = [
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com',
  'fakeinbox.com', 'dispostable.com', 'maildrop.cc', 'yopmail.com', 'throwawaymail.com'
];

const isTempEmail = (email) => {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  return TEMP_EMAIL_DOMAINS.includes(domain);
};

const unicodeNameRegex = /^[\p{L} .'-]{2,50}$/u;

function isCommonPassword(pw) {
  return COMMON_PASSWORDS.has(pw.trim().toLowerCase());
}

function hasExcessiveRepeat(pw) {
  return /(.)\1{4,}/.test(pw);
}

function isMonotone(pw) {
  // returns true if all characters are the same (e.g. "000000000" or "aaaaaaaaa")
  return pw.length > 0 && pw.split('').every(c => c === pw[0]);
}

function isPartOfField(pw, field) {
  if (!field || field.length < 3) return false;
  return pw.includes(field.toLowerCase());
}

function isValidContact(ct) {
  // Allow +, -, space, digits only, 7-20 chars, must have at least 7 digits
  if (!ct) return false;
  const numeric = ct.replace(/[^\d]/g, '');
  return /^[\d\s\-\+]{7,20}$/.test(ct) && numeric.length >= 7;
}

function isXSS(val) {
  return /<script|<\/script|javascript:/i.test(val);
}

const validatePassword = (value, { req }) => {
  if (!value || typeof value !== 'string') throw new Error('Password is required');
  const pw = value.trim();
  if (pw.length < 8) throw new Error('Password must be at least 8 characters');
  if (pw.length > 200) throw new Error('Password too long');
  if (/^\d+$/.test(pw)) throw new Error('Password cannot be entirely numeric');
  if (hasExcessiveRepeat(pw)) throw new Error('Password cannot contain excessive character repeats');
  if (isMonotone(pw)) throw new Error('Password cannot have all identical characters');
  if (/\s{2,}/.test(pw)) throw new Error('Password cannot contain consecutive whitespace');
  if (isCommonPassword(pw)) throw new Error('Password is too common. Please choose another.');

  // Extra: No email, name, org
  const lower = pw.toLowerCase();
  const name = (req.body?.name ?? '').toLowerCase();
  const email = (req.body?.email ?? '').split('@')[0].toLowerCase();
  const org = (req.body?.organization ?? '').toLowerCase();
  if (isPartOfField(lower, name)) throw new Error('Password cannot contain your name');
  if (isPartOfField(lower, email)) throw new Error('Password cannot contain your email');
  if (isPartOfField(lower, org)) throw new Error('Password cannot contain your organization');

  // For "strong" passwords (optional, comment out if not strict): at least 1 upper, lower, number, symbol
  // if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw) || !/[^\w\s]/.test(pw)) {
  //   throw new Error('Password must have uppercase, lowercase, number, and special character');
  // }
  return true;
};

export const validateSignup = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters')
    .custom((val) => {
      if (!unicodeNameRegex.test(val)) throw new Error("Name contains invalid characters (letters, spaces, hyphens, apostrophe, dot)");
      return true;
    }),
  body('organization')
    .trim()
    .notEmpty().withMessage('Organization is required')
    .isLength({ min: 2, max: 100 }).withMessage('Organization must be 2–100 chars')
    .matches(/^[a-zA-Z0-9\s\-&,.'"]+$/).withMessage('Organization contains invalid characters'),
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .custom((value) => {
      if (isTempEmail(value)) throw new Error('Temporary email addresses are not allowed.');
      if (/\.{2,}/.test(value)) throw new Error('Email cannot contain repeated dots.');
      return true;
    }),
  body('password').custom(validatePassword),
  body('contact')
    .optional()
    .trim()
    .custom((value) => isValidContact(value))
    .withMessage('Contact must be 7-20 digits, may include +, -, space'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 }).withMessage('Address must be 5–100 characters')
    .custom(val => !isXSS(val)).withMessage('Address cannot contain script content'),
  body('memberType')
    .optional()
    .isIn(['Junior', 'Ordinary', 'Corporate'])
    .withMessage('Invalid member type')
];

export const validateLogin = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .custom(value => {
      if (isTempEmail(value)) throw new Error('Temporary email addresses are not allowed.');
      return true;
    }),
  body('password').notEmpty().withMessage('Password is required'),
  body('otp')
    .optional()
    .matches(/^\d{4,6}$/).withMessage('OTP must be 4–6 digits')
];

export const validateResetRequest = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail()
    .custom(value => {
      if (isTempEmail(value)) throw new Error('Temporary email addresses are not allowed.');
      return true;
    })
];

export const validateNewPassword = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').custom(validatePassword)
];

// In validators.js
export const validateOtp = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').matches(/^\d{4,6}$/).withMessage('OTP must be 4–6 digits')
];

export const validateUpdateProfile = [
  // Only fields that are updatable, and only if they are present in the request
  body('contact')
    .optional()
    .trim()
    .custom((value) => isValidContact(value))
    .withMessage('Contact must be 7-20 digits, may include +, -, space'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 }).withMessage('Address must be 5–100 characters')
    .custom(val => !isXSS(val)).withMessage('Address cannot contain script content'),
  body('organization')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Organization must be 2–100 chars')
    .matches(/^[a-zA-Z0-9\s\-&,.'"]+$/).withMessage('Organization contains invalid characters'),
  body('newPassword')
    .optional()
    .custom(validatePassword) // uses same rules as signup!
];
