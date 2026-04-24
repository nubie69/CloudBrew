import { request } from './http';

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function fetchHealth() {
  return request('/health');
}

export function fetchBootstrapData() {
  return request('/bootstrap');
}

export function createOrder(payload) {
  return request('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOrderStatus(orderId, status, handledBy) {
  return request(`/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, handledBy }),
  });
}

export function saveRecipe(drinkName, recipe) {
  return request(`/recipes/${encodeURIComponent(drinkName)}`, {
    method: 'PUT',
    body: JSON.stringify(recipe),
  });
}

export function deleteRecipe(drinkName) {
  return request(`/recipes/${encodeURIComponent(drinkName)}`, {
    method: 'DELETE',
  });
}

export function fetchStaffDirectory(params = {}) {
  return request(`/staff${buildQueryString(params)}`);
}

export function createStaffMember(payload) {
  return request('/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateStaffStatus(staffId, active) {
  return request(`/staff/${encodeURIComponent(staffId)}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

export function deleteStaffMember(staffId) {
  return request(`/staff/${encodeURIComponent(staffId)}`, {
    method: 'DELETE',
  });
}

export function updateStaffMember(staffId, payload) {
  return request(`/staff/${encodeURIComponent(staffId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchAuditTrail(params = {}) {
  return request(`/logs${buildQueryString(params)}`);
}

export function fetchOperationsReport() {
  return request('/reports', {
    method: 'POST',
  });
}
