import { request } from './http';

export function loginWithCredentials(role, email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, email, password }),
  });
}

export function requestAdminPasswordReset(recoveryEmail) {
  return request('/admin-recovery', {
    method: 'POST',
    body: JSON.stringify({ email: recoveryEmail }),
  });
}

export function resetAdminPassword(token, newPassword) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
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
