// src/utils/logUtils.js

// General-purpose secure client-side log function
export async function logSecurityClient({
  category = 'client',
  action,
  details = '',
  severity = 'low'
} = {}) {
  try {
    await fetch('/api/log/client', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ category, action, details, severity })
    })
  } catch (err) {
    console.warn('[Client Log Failed]', err)
  }
}

// Shortcut for 403 logs
export function log403Access() {
  return logSecurityClient({
    category: 'auth',
    action: '403_forbidden',
    details: 'User landed on 403 page',
    severity: 'medium'
  })
}

// Shortcut for 404 logs
export function log404Access() {
  return logSecurityClient({
    category: 'client',
    action: '404_not_found',
    details: 'User landed on 404 page',
    severity: 'low'
  })
}

// Shortcut for 500 logs
export function log500Error() {
  return logSecurityClient({
    category: 'error',
    action: '500_internal_error',
    details: 'User landed on 500 error page',
    severity: 'high'
  })
}

// Shortcut for csrf errors
export function logCsrfError() {
  return logSecurityClient({
    category: 'csrf',
    action: 'csrf_token_invalid',
    details: 'User landed on CSRF error page',
    severity: 'critical'
  })
}

