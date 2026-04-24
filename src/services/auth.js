import { request } from './http';

export function loginWithCredentials(role, email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, email, password }),
  });
}

export function requestAdminPasswordReset(recoveryEmail) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ recoveryEmail }),
  });
}

export function resetAdminPassword(recoveryEmail, resetCode, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ recoveryEmail, resetCode, newPassword }),
  });
}

export function changeAdminPassword(oldPassword, newPassword) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export function updateAdminRecoveryEmail(recoveryEmail) {
  return request('/auth/recovery-email', {
    method: 'PUT',
    body: JSON.stringify({ recoveryEmail }),
  });
}
