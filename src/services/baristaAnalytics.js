import { http } from './http';

/**
 * Fetch barista-specific analytics dashboard
 * Includes: personal stats (completed orders, prep times), queue health
 * @param {Object} options - Query options
 * @param {string} options.barista - Barista ID (defaults to current user)
 * @param {string} options.from - ISO date string for range start
 * @param {string} options.to - ISO date string for range end
 * @returns {Promise<Object>} Analytics data with myStats and queueHealth
 */
export async function fetchBaristaAnalytics(options = {}) {
  const params = new URLSearchParams();

  if (options.barista) {
    params.append('barista', options.barista);
  }

  if (options.from) {
    params.append('from', options.from);
  }

  if (options.to) {
    params.append('to', options.to);
  }

  const query = params.toString();
  const path = query ? `/analytics/barista-dashboard?${query}` : '/analytics/barista-dashboard';

  return http.request(path, {
    method: 'GET',
  });
}

/**
 * Calculate metric changes from two time periods
 * @param {Object} current - Current period stats
 * @param {Object} previous - Previous period stats
 * @returns {Object} Changes with percentage deltas
 */
export function calculateMetricChanges(current, previous) {
  if (!current || !previous) {
    return {};
  }

  const calculateDelta = (curr, prev) => {
    if (prev === 0 || prev === null) {
      return curr > 0 ? 100 : 0;
    }
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    completedOrders: calculateDelta(
      current.completedOrders,
      previous.completedOrders
    ),
    avgPrepMinutes: calculateDelta(
      previous.avgPrepMinutes,
      current.avgPrepMinutes
    ), // Inverted: lower is better
    totalDrinks: calculateDelta(current.totalDrinks, previous.totalDrinks),
  };
}

/**
 * Format prep time display
 * @param {number} minutes - Prep time in minutes
 * @returns {string} Formatted time string
 */
export function formatPrepTime(minutes) {
  if (minutes < 1) {
    return '< 1 min';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Get performance tier based on avg prep time
 * @param {number} avgMinutes - Average prep minutes
 * @returns {Object} Tier with name and color
 */
export function getPerformanceTier(avgMinutes) {
  if (avgMinutes <= 3) {
    return { tier: 'elite', color: '#4CAF50', label: 'Elite' };
  }
  if (avgMinutes <= 5) {
    return { tier: 'excellent', color: '#8BC34A', label: 'Excellent' };
  }
  if (avgMinutes <= 8) {
    return { tier: 'good', color: '#FFC107', label: 'Good' };
  }
  return { tier: 'needs-improvement', color: '#FF9800', label: 'Needs Improvement' };
}
