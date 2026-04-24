import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createOrder,
  createStaffMember,
  deleteRecipe,
  deleteStaffMember,
  fetchAuditTrail,
  fetchBootstrapData,
  fetchHealth,
  fetchOperationsReport,
  fetchStaffDirectory,
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
import { notifyNewOrder } from '../services/notifications';
import { ORDER_STATUS } from '../utils/helpers';

const UserContext = createContext(null);
const DEFAULT_STAFF_META = { total: 0, page: 1, pageSize: 10, totalPages: 1, query: '' };
const DEFAULT_LOG_META = { total: 0, page: 1, pageSize: 20, totalPages: 1, query: '' };
const DEFAULT_ADMIN_SETTINGS = { recoveryEmail: '', recoveryEmailConfigured: false };

function normalizeCollectionMeta(meta, fallback) {
  return {
    ...fallback,
    ...(meta || {}),
  };
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
    setOrders((prev) => [savedOrder, ...prev]);
    notifyNewOrder(savedOrder);
    return savedOrder;
  };

  const setOrderStatus = async (orderId, status) => {
    if (!currentUser) {
      throw new Error('No logged-in user.');
    }

    const updatedOrder = await patchOrderStatus(orderId, status, currentUser.name);
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              ...updatedOrder,
            }
          : order
      )
    );
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

  const requestAdminResetCode = async (email) => requestAdminPasswordReset(email);
  const resetAdminAccountPassword = async (email, resetCode, newPassword) => resetAdminPassword(email, resetCode, newPassword);

  const updateAdminPassword = async (currentPassword, newPassword) => {
    ensureAdmin();
    return changeAdminPassword(currentPassword, newPassword);
  };

  const saveAdminRecoveryEmail = async (recoveryEmail) => {
    ensureAdmin();
    const updated = await updateAdminRecoveryEmail(recoveryEmail);
    setAdminSettings({
      recoveryEmail: updated?.recoveryEmail || '',
      recoveryEmailConfigured: Boolean(updated?.recoveryEmailConfigured),
    });
    return updated;
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
      ready,
      bootError,
      authToken,
      login,
      logout,
      refreshData,
      placeOrder,
      setOrderStatus,
      updateRecipe,
      removeRecipe,
      addStaffMember,
      setStaffActive,
      editStaffMember,
      removeStaffMember,
      loadStaff,
      loadLogs,
      generateReport,
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
