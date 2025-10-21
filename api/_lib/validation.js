/**
 * Input Validation Utility
 *
 * Provides validation functions for API request inputs to prevent:
 * - SQL injection
 * - XSS attacks
 * - Invalid data types
 * - Missing required fields
 */

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

/**
 * Validate required fields exist in object
 */
export function validateRequired(data, fields) {
  const missing = [];

  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Validate string field
 */
export function validateString(value, fieldName, options = {}) {
  const { minLength = 0, maxLength = 10000, pattern = null, allowEmpty = false } = options;

  if (value === undefined || value === null) {
    if (!allowEmpty) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }
    return;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }

  if (!allowEmpty && value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName);
  }

  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`, fieldName);
  }

  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${fieldName} format is invalid`, fieldName);
  }
}

/**
 * Validate number field
 */
export function validateNumber(value, fieldName, options = {}) {
  const { min = null, max = null, integer = false } = options;

  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  const num = Number(value);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }

  if (integer && !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`, fieldName);
  }

  if (min !== null && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
  }

  if (max !== null && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`, fieldName);
  }
}

/**
 * Validate email address
 */
export function validateEmail(value, fieldName = 'email') {
  validateString(value, fieldName, {
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  });
}

/**
 * Validate URL
 */
export function validateURL(value, fieldName = 'url', options = {}) {
  const { allowedProtocols = ['http', 'https'], allowedDomains = null } = options;

  validateString(value, fieldName, { maxLength: 2048 });

  let url;
  try {
    url = new URL(value);
  } catch (e) {
    throw new ValidationError(`${fieldName} must be a valid URL`, fieldName);
  }

  if (!allowedProtocols.includes(url.protocol.replace(':', ''))) {
    throw new ValidationError(
      `${fieldName} must use one of these protocols: ${allowedProtocols.join(', ')}`,
      fieldName
    );
  }

  if (allowedDomains && !allowedDomains.some(domain => url.hostname.endsWith(domain))) {
    throw new ValidationError(
      `${fieldName} must be from an allowed domain`,
      fieldName
    );
  }
}

/**
 * Validate enum value
 */
export function validateEnum(value, fieldName, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      fieldName
    );
  }
}

/**
 * Validate boolean
 */
export function validateBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} must be a boolean`, fieldName);
  }
}

/**
 * Validate array
 */
export function validateArray(value, fieldName, options = {}) {
  const { minLength = 0, maxLength = 1000, itemValidator = null } = options;

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }

  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must have at least ${minLength} items`, fieldName);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} must have at most ${maxLength} items`, fieldName);
  }

  if (itemValidator) {
    value.forEach((item, index) => {
      try {
        itemValidator(item);
      } catch (error) {
        throw new ValidationError(
          `${fieldName}[${index}]: ${error.message}`,
          `${fieldName}[${index}]`
        );
      }
    });
  }
}

/**
 * Validate object structure
 */
export function validateObject(value, fieldName, schema) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`, fieldName);
  }

  // Check for required fields and validate each field
  for (const [key, validator] of Object.entries(schema)) {
    if (typeof validator === 'function') {
      validator(value[key], key);
    }
  }
}

/**
 * Sanitize string to prevent XSS
 */
export function sanitizeString(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate GitHub username
 */
export function validateGitHubUsername(value, fieldName = 'username') {
  validateString(value, fieldName, {
    minLength: 1,
    maxLength: 39,
    pattern: /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/
  });
}

/**
 * Validate GitHub repository name
 */
export function validateGitHubRepoName(value, fieldName = 'repository') {
  validateString(value, fieldName, {
    minLength: 1,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9._-]+$/
  });
}

/**
 * Validate phone number (E.164 format)
 */
export function validatePhoneNumber(value, fieldName = 'phoneNumber') {
  validateString(value, fieldName, {
    pattern: /^\+[1-9]\d{1,14}$/
  });
}

/**
 * Validate Twilio SID format
 */
export function validateTwilioSID(value, fieldName, prefix) {
  validateString(value, fieldName, {
    minLength: 34,
    maxLength: 34,
    pattern: new RegExp(`^${prefix}[a-f0-9]{32}$`, 'i')
  });
}

/**
 * Handle validation errors in API handlers
 */
export function handleValidationError(error, res) {
  if (error instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: error.message,
      field: error.field
    });
  }

  // Re-throw non-validation errors
  throw error;
}

/**
 * Middleware-style validation wrapper
 */
export function withValidation(handler, validator) {
  return async (req, res) => {
    try {
      // Validate request
      await validator(req);

      // Call handler if validation passes
      return await handler(req, res);
    } catch (error) {
      return handleValidationError(error, res);
    }
  };
}
