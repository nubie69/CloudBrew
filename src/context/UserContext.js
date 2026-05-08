import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchAnalyticsOverview,
  createOrder,
  createStaffMember,
  deleteRecipe,
  deleteStaffMember,
  fetchAuditTrail,
  fetchBootstrapData,
  fetchHealth,
  fetchOperationsReport,
  fetchQueueHealth,
  runIntegrationsSelfTest,
  fetchSalesAnalytics,
  fetchStaffDirectory,
  fetchStaffKpis,
  fetchTopItemsAnalytics,
  uploadProductImage as uploadProductImageRequest,
  saveRecipe,
  updateOrderStatus as patchOrderStatus,
  updateStaffMember,
  updateStaffStatus,
} from '../services/api';
import {
  changeAdminPassword,
  loginWithCredentials,
  requestAdminPasswordReset,
  resetAdminPassword,
  updateAdminRecoveryEmail,
} from '../services/auth';
import { clearAuthToken, setAuthToken } from '../services/http';
import {
  connectQueueRealtime,
  subscribeToRealtimeStatus,
  subscribeToOrders,
  subscribeToOrderUpdates,
} from '../services/notifications';
import { ORDER_STATUS } from '../utils/helpers';

const UserContext = createContext(null);
const DEFAULT_STAFF_META = { total: 0, page: 1, pageSize: 10, totalPages: 1, query: '' };
const DEFAULT_LOG_META = { total: 0, page: 1, pageSize: 20, totalPages: 1, query: '' };
const DEFAULT_ADMIN_SETTINGS = { recoveryEmail: '', recoveryEmailConfigured: false };
const DEFAULT_REALTIME_STATUS = { state: 'disconnected', message: 'Realtime offline', updatedAt: '' };

function normalizeCollectionMeta(meta, fallback) {
  return {
    ...fallback,
    ...(meta || {}),
  };
}

function requireSuccessResponse(payload, fallbackMessage) {
  if (!payload || payload.success === false) {
    throw new Error(payload?.message || fallbackMessage);
  }

  return payload;
}

function updateMetaTotal(meta, delta) {
  const nextTotal = Math.max(0, (meta.total || 0) + delta);
  const pageSize = meta.pageSize || 1;
  return {
    ...meta,
    total: nextTotal,
    totalPages: Math.max(1, Math.ceil(nextTotal / pageSize)),
  };
}

function upsertOrder(orders, incoming) {
  if (!incoming?.id) {
    return orders;
  }

  const exists = orders.some((order) => order.id === incoming.id);
  if (!exists) {
    return [incoming, ...orders];
  }

  return orders.map((order) => (order.id === incoming.id ? { ...order, ...incoming } : order));
}

const DEFAULT_DASHBOARD_METRICS = {
  totalSalesToday: 0,
  pendingOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  activeBaristas: 0,
  activeCashiers: 0,
  currentQueueCount: 0,
  mostSoldDrinks: [],
  recentOrders: [],
  peakHours: {},
  inventoryAlerts: [],
  baristas: [],
  lastUpdated: new Date().toISOString(),
};

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthTokenState] = useState('');
  const [orders, setOrders] = useState([]);
  const [recipes, setRecipes] = useState({});
  const [logs, setLogs] = useState([]);
  const [logsMeta, setLogsMeta] = useState(DEFAULT_LOG_META);
  const [staff, setStaff] = useState([]);
  const [staffMeta, setStaffMeta] = useState(DEFAULT_STAFF_META);
  const [adminSettings, setAdminSettings] = useState(DEFAULT_ADMIN_SETTINGS);
  const [realtimeStatus, setRealtimeStatus] = useState(DEFAULT_REALTIME_STATUS);
  const [dashboardMetrics, setDashboardMetrics] = useState(DEFAULT_DASHBOARD_METRICS);
  const [dashboardRefreshInterval, setDashboardRefreshInterval] = useState(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState('');

  const syncState = (payload = {}) => {
    setOrders(payload.orders || []);
    setRecipes(payload.recipes || {});
    setLogs(payload.logs || []);
    setLogsMeta(normalizeCollectionMeta(payload.logsMeta, DEFAULT_LOG_META));
    setStaff(payload.staff || []);
    setStaffMeta(normalizeCollectionMeta(payload.staffMeta, DEFAULT_STAFF_META));
    setAdminSettings(payload.adminSettings || DEFAULT_ADMIN_SETTINGS);
  };

  const refreshData = async () => {
    if (!authToken) {
      return null;
    }

    const payload = await fetchBootstrapData();
    syncState(payload);
    return payload;
  };

  const computeDashboardMetrics = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    try {
      // Calculate metrics from current orders
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const todaysOrders = orders.filter(
        (order) => new Date(order.createdAt) >= todayStart
      );
      
      const pendingCount = todaysOrders.filter(
        (o) => o.status === ORDER_STATUS.PENDING
      ).length;
      
      const completedCount = todaysOrders.filter(
        (o) => o.status === ORDER_STATUS.COMPLETED
      ).length;
      
      const inProgressCount = todaysOrders.filter(
        (o) => o.status === ORDER_STATUS.IN_PROGRESS
      ).length;

      // Calculate total sales today
      const totalSalesToday = todaysOrders
        .filter((o) => o.paymentStatus === 'paid')
        .reduce((sum, order) => sum + (order.totalAmount || 0), 0);

      // Get most sold drinks
      const drinkCounts = {};
      todaysOrders.forEach((order) => {
        const drink = order.item || 'Unknown';
        drinkCounts[drink] = (drinkCounts[drink] || 0) + (order.quantity || 1);
      });
      const mostSoldDrinks = Object.entries(drinkCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get recent orders
      const recentOrders = [...todaysOrders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

      // Get active baristas and cashiers
      const activeBaristas = staff.filter(
        (s) => s.role === 'barista' && s.active
      );
      const activeCashiers = staff.filter(
        (s) => s.role === 'cashier' && s.active
      );

      // Get queue count (pending + in-progress)
      const currentQueueCount = pendingCount + inProgressCount;

      setDashboardMetrics({
        totalSalesToday,
        pendingOrders: pendingCount,
        completedOrders: completedCount,
        cancelledOrders: 0,
        activeBaristas: activeBaristas.length,
        activeCashiers: activeCashiers.length,
        currentQueueCount,
        mostSoldDrinks,
        recentOrders,
        peakHours: {},
        inventoryAlerts: [],
        baristas: activeBaristas,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('Error computing dashboard metrics:', error);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        await fetchHealth();
        setBootError('');
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setBootError(error.message);
      } finally {
        if (isMounted) {
          setReady(true);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authToken || !currentUser) {
      return undefined;
    }

    let mounted = true;
    const disconnectRealtime = connectQueueRealtime(authToken);
    const unsubscribeCreated = subscribeToOrders((order) => {
      if (!mounted) {
        return;
      }
      setOrders((prev) => upsertOrder(prev, order));
    });
    const unsubscribeUpdated = subscribeToOrderUpdates((order) => {
      if (!mounted) {
        return;
      }
      setOrders((prev) => upsertOrder(prev, order));
    });
    const unsubscribeRealtimeStatus = subscribeToRealtimeStatus((status) => {
      if (!mounted) {
        return;
      }
      setRealtimeStatus(status || DEFAULT_REALTIME_STATUS);
    });

    refreshData().catch(() => {
      // Ignore bootstrap sync failures; realtime events can still continue.
    });

    return () => {
      mounted = false;
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeRealtimeStatus();
      disconnectRealtime();
    };
  }, [authToken, currentUser]);

  // Auto-refresh dashboard metrics for admin
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      return undefined;
    }

    // Initial computation
    computeDashboardMetrics();

    // Set up auto-refresh every 3 seconds
    const intervalId = setInterval(() => {
      computeDashboardMetrics();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentUser, orders, staff]);

  const login = async (role, email, password) => {
    const authPayload = await loginWithCredentials(role, email, password);
    const token = authPayload?.token;
    const user = authPayload?.user;

    if (!token || !user) {
      throw new Error('Login response is missing authentication details.');
    }

    setAuthToken(token);
    setAuthTokenState(token);
    setCurrentUser(user);
    setBootError('');

    try {
      await fetchBootstrapData().then(syncState);
      return user;
    } catch (error) {
      clearAuthToken();
      setAuthTokenState('');
      setCurrentUser(null);
      throw error;
    }
  };

  const logout = () => {
    clearAuthToken();
    setAuthTokenState('');
    setCurrentUser(null);
    setOrders([]);
    setRecipes({});
    setLogs([]);
    setLogsMeta(DEFAULT_LOG_META);
    setStaff([]);
    setStaffMeta(DEFAULT_STAFF_META);
    setAdminSettings(DEFAULT_ADMIN_SETTINGS);
    setRealtimeStatus(DEFAULT_REALTIME_STATUS);
    setDashboardMetrics(DEFAULT_DASHBOARD_METRICS);
  };

  const ensureAdmin = () => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Only admin can perform this action.');
    }
  };

  const loadStaff = async (params = {}) => {
    ensureAdmin();
    const result = await fetchStaffDirectory(params);
    setStaff(result.items || []);
    setStaffMeta(normalizeCollectionMeta(result, DEFAULT_STAFF_META));
    return result;
  };

  const loadLogs = async (params = {}) => {
    ensureAdmin();
    const result = await fetchAuditTrail(params);
    setLogs(result.items || []);
    setLogsMeta(normalizeCollectionMeta(result, DEFAULT_LOG_META));
    return result;
  };

  const refreshAuditTrail = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      return;
    }

    try {
      await loadLogs({ page: 1, pageSize: logsMeta.pageSize || DEFAULT_LOG_META.pageSize, query: logsMeta.query || '' });
    } catch (_error) {
      // Ignore audit refresh errors to avoid blocking successful CRUD actions.
    }
  };

  const placeOrder = async ({ item, size, addons, quantity = 1 }) => {
    if (!currentUser) {
      throw new Error('No logged-in user.');
    }

    const order = {
      item,
      quantity,
      size,
      addons,
      status: ORDER_STATUS.PENDING,
      createdBy: currentUser.name,
    };

    const savedOrder = await createOrder(order);
    setOrders((prev) => upsertOrder(prev, savedOrder));
    return savedOrder;
  };

  const setOrderStatus = async (orderId, status) => {
    if (!currentUser) {
      throw new Error('No logged-in user.');
    }

    const updatedOrder = await patchOrderStatus(orderId, status, currentUser.name);
    setOrders((prev) => upsertOrder(prev, updatedOrder));
  };

  const updateRecipe = async (drinkName, recipe) => {
    ensureAdmin();

    const previousRecipe = recipes[drinkName];
    setRecipes((prev) => ({
      ...prev,
      [drinkName]: recipe,
    }));

    try {
      const savedRecipe = await saveRecipe(drinkName, recipe);
      setRecipes((prev) => ({
        ...prev,
        [drinkName]: {
          ingredients: savedRecipe?.ingredients || recipe.ingredients,
          steps: savedRecipe?.steps || recipe.steps,
          imageUrl: savedRecipe?.imageUrl || '',
        },
      }));
      await refreshAuditTrail();
    } catch (error) {
      setRecipes((prev) => {
        const rollback = { ...prev };
        if (previousRecipe) {
          rollback[drinkName] = previousRecipe;
        } else {
          delete rollback[drinkName];
        }
        return rollback;
      });
      throw error;
    }
  };

  const uploadProductImage = async (imageData) => {
    ensureAdmin();
    if (!imageData) {
      throw new Error('imageData is required.');
    }

    return uploadProductImageRequest(imageData);
  };

  const removeRecipe = async (drinkName) => {
    ensureAdmin();

    const previousRecipe = recipes[drinkName];
    if (!previousRecipe) {
      throw new Error('Recipe not found in local state.');
    }

    setRecipes((prev) => {
      const next = { ...prev };
      delete next[drinkName];
      return next;
    });

    try {
      await deleteRecipe(drinkName);
      await refreshAuditTrail();
    } catch (error) {
      setRecipes((prev) => ({
        ...prev,
        [drinkName]: previousRecipe,
      }));
      throw error;
    }
  };

  const addStaffMember = async ({ name, role, email, password }) => {
    ensureAdmin();

    const tempId = `temp-${Date.now()}`;
    const optimisticMember = { id: tempId, name, role, email, active: true };

    setStaff((prev) => [optimisticMember, ...prev]);
    setStaffMeta((prev) => updateMetaTotal(prev, 1));

    try {
      const created = await createStaffMember({ name, role, email, password });
      setStaff((prev) => prev.map((member) => (member.id === tempId ? created : member)));
      await refreshAuditTrail();
      return created;
    } catch (error) {
      setStaff((prev) => prev.filter((member) => member.id !== tempId));
      setStaffMeta((prev) => updateMetaTotal(prev, -1));
      throw error;
    }
  };

  const setStaffActive = async (staffId, active) => {
    ensureAdmin();

    const previous = staff.find((member) => member.id === staffId);
    if (!previous) {
      throw new Error('Staff member not found.');
    }

    setStaff((prev) => prev.map((member) => (member.id === staffId ? { ...member, active } : member)));

    try {
      await updateStaffStatus(staffId, active);
      await refreshAuditTrail();
    } catch (error) {
      setStaff((prev) => prev.map((member) => (member.id === staffId ? previous : member)));
      throw error;
    }
  };

  const editStaffMember = async (staffId, payload) => {
    ensureAdmin();

    const previous = staff.find((member) => member.id === staffId);
    if (!previous) {
      throw new Error('Staff member not found.');
    }

    setStaff((prev) => prev.map((member) => (member.id === staffId ? { ...member, ...payload } : member)));

    try {
      const updated = await updateStaffMember(staffId, payload);
      setStaff((prev) => prev.map((member) => (member.id === staffId ? updated : member)));
      await refreshAuditTrail();
      return updated;
    } catch (error) {
      setStaff((prev) => prev.map((member) => (member.id === staffId ? previous : member)));
      throw error;
    }
  };

  const removeStaffMember = async (staffId) => {
    ensureAdmin();

    const previous = staff.find((member) => member.id === staffId);
    if (!previous) {
      throw new Error('Staff member not found.');
    }

    setStaff((prev) => prev.filter((member) => member.id !== staffId));
    setStaffMeta((prevMeta) => updateMetaTotal(prevMeta, -1));

    try {
      await deleteStaffMember(staffId);
      await refreshAuditTrail();
    } catch (error) {
      setStaff((prev) => [previous, ...prev]);
      setStaffMeta((prevMeta) => updateMetaTotal(prevMeta, 1));
      throw error;
    }
  };

  const generateReport = () => fetchOperationsReport();
  const runIntegrationSelfTest = () => runIntegrationsSelfTest();
  const getAnalyticsOverview = (params = {}) => fetchAnalyticsOverview(params);
  const getSalesAnalytics = (params = {}) => fetchSalesAnalytics(params);
  const getTopItemsAnalytics = (params = {}) => fetchTopItemsAnalytics(params);
  const getStaffKpis = (params = {}) => fetchStaffKpis(params);
  const getQueueHealth = () => fetchQueueHealth();

  const requestAdminResetCode = async (email) => {
    const response = await requestAdminPasswordReset(email);
    return requireSuccessResponse(response, 'Unable to request password reset right now.');
  };
  const resetAdminAccountPassword = async (token, newPassword) => {
    const response = await resetAdminPassword(token, newPassword);
    return requireSuccessResponse(response, 'Unable to reset password right now.');
  };

  const updateAdminPassword = async (currentPassword, newPassword) => {
    ensureAdmin();
    return changeAdminPassword(currentPassword, newPassword);
  };

  const saveAdminRecoveryEmail = async (recoveryEmail) => {
    ensureAdmin();
    const updated = await updateAdminRecoveryEmail(recoveryEmail);
    const normalized = requireSuccessResponse(updated, 'Unable to save recovery email.');
    setAdminSettings({
      recoveryEmail: normalized?.recoveryEmail || '',
      recoveryEmailConfigured: Boolean(normalized?.recoveryEmailConfigured),
    });
    return normalized;
  };

  const value = useMemo(
    () => ({
      currentUser,
      orders,
      recipes,
      logs,
      logsMeta,
      staff,
      staffMeta,
      adminSettings,
      realtimeStatus,
      dashboardMetrics,
      ready,
      bootError,
      authToken,
      login,
      logout,
      refreshData,
      computeDashboardMetrics,
      placeOrder,
      setOrderStatus,
      updateRecipe,
      uploadProductImage,
      removeRecipe,
      addStaffMember,
      setStaffActive,
      editStaffMember,
      removeStaffMember,
      loadStaff,
      loadLogs,
      generateReport,
      runIntegrationSelfTest,
      getAnalyticsOverview,
      getSalesAnalytics,
      getTopItemsAnalytics,
      getStaffKpis,
      getQueueHealth,
      requestAdminResetCode,
      resetAdminAccountPassword,
      updateAdminPassword,
      saveAdminRecoveryEmail,
    }),
    [
      currentUser,
      orders,
      recipes,
      logs,
      logsMeta,
      staff,
      staffMeta,
      adminSettings,
      realtimeStatus,
      dashboardMetrics,
      ready,
      bootError,
      authToken,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used inside UserProvider.');
  }
  return context;
}
