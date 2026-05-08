import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { useUser } from '../context/UserContext';
import { formatTimestamp, summarizeOrders, toListFromMultiline, toMultilineText } from '../utils/helpers';

const ROLE_OPTIONS = ['cashier', 'barista'];
const STAFF_PAGE_SIZE = 8;
const LOG_PAGE_SIZE = 15;
const MAX_RECIPE_IMAGE_LENGTH = 6 * 1024 * 1024;
const ADMIN_PANELS = {
  overview: 'overview',
  recipes: 'recipes',
  staff: 'staff',
  settings: 'settings',
  logs: 'logs',
};

const SIDEBAR_LINKS = [
  { key: ADMIN_PANELS.overview, label: 'Overview Dashboard', group: 'dashboard' },
  { key: ADMIN_PANELS.recipes, label: 'Recipe Management', group: 'management' },
  { key: ADMIN_PANELS.staff, label: 'Staff Management', group: 'management' },
  { key: ADMIN_PANELS.settings, label: 'Settings', group: 'management' },
  { key: ADMIN_PANELS.logs, label: 'Audit Management', group: 'management' },
];

function RoleChip({ role, active, onPress }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{role}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, loading = false, disabled = false, tone = 'primary' }) {
  const buttonStyles = [styles.actionButton, tone === 'danger' ? styles.dangerButton : null, disabled ? styles.disabledButton : null];

  return (
    <Pressable style={buttonStyles} onPress={onPress} disabled={loading || disabled}>
      {loading ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

function SidebarButton({ label, active, onPress }) {
  return (
    <Pressable style={[styles.sidebarButton, active && styles.sidebarButtonActive]} onPress={onPress}>
      <Text style={[styles.sidebarButtonText, active && styles.sidebarButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function AdminScreen() {
  const {
    currentUser,
    orders,
    logs,
    logsMeta,
    recipes,
    staff,
    staffMeta,
    adminSettings,
    dashboardMetrics,
    realtimeStatus,
    updateRecipe,
    removeRecipe,
    addStaffMember,
    editStaffMember,
    setStaffActive,
    removeStaffMember,
    loadStaff,
    loadLogs,
    generateReport,
    runIntegrationSelfTest,
    updateAdminPassword,
    saveAdminRecoveryEmail,
    uploadProductImage,
  } = useUser();

  const drinkNames = useMemo(() => Object.keys(recipes).sort((a, b) => a.localeCompare(b)), [recipes]);
  const [selectedDrink, setSelectedDrink] = useState(drinkNames[0] || '');
  const [ingredientsText, setIngredientsText] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [recipeImageUrl, setRecipeImageUrl] = useState('');
  const [newDrinkName, setNewDrinkName] = useState('');
  const [newIngredientsText, setNewIngredientsText] = useState('');
  const [newStepsText, setNewStepsText] = useState('');
  const [newRecipeImageUrl, setNewRecipeImageUrl] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState(false);

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState('cashier');
  const [addingStaff, setAddingStaff] = useState(false);
  const [togglingStaffId, setTogglingStaffId] = useState('');
  const [deletingStaffId, setDeletingStaffId] = useState('');
  const [editingStaffId, setEditingStaffId] = useState('');
  const [editingStaffName, setEditingStaffName] = useState('');
  const [editingStaffEmail, setEditingStaffEmail] = useState('');
  const [editingStaffPassword, setEditingStaffPassword] = useState('');
  const [editingStaffRole, setEditingStaffRole] = useState('cashier');
  const [savingStaffId, setSavingStaffId] = useState('');

  const [staffQueryInput, setStaffQueryInput] = useState('');
  const [staffQuery, setStaffQuery] = useState('');
  const [staffPage, setStaffPage] = useState(1);
  const [loadingStaffList, setLoadingStaffList] = useState(false);

  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);
  const [adminRecoveryEmail, setAdminRecoveryEmail] = useState('');
  const [savingRecoveryEmail, setSavingRecoveryEmail] = useState(false);

  const [logQueryInput, setLogQueryInput] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [loadingLogsList, setLoadingLogsList] = useState(false);

  const [reportSnapshot, setReportSnapshot] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selfTestLoading, setSelfTestLoading] = useState(false);
  const [selfTestResult, setSelfTestResult] = useState(null);
  const [activePanel, setActivePanel] = useState(ADMIN_PANELS.overview);
  const [showControlMap, setShowControlMap] = useState(false);
  const [uploadingImageSlot, setUploadingImageSlot] = useState('');

  const loadStaffPage = async (pageValue, queryValue) => {
    setLoadingStaffList(true);
    try {
      await loadStaff({ page: pageValue, pageSize: STAFF_PAGE_SIZE, query: queryValue });
    } catch (error) {
      Alert.alert('Unable to load staff', error.message);
    } finally {
      setLoadingStaffList(false);
    }
  };

  const loadLogPage = async (pageValue, queryValue) => {
    setLoadingLogsList(true);
    try {
      await loadLogs({ page: pageValue, pageSize: LOG_PAGE_SIZE, query: queryValue });
    } catch (error) {
      Alert.alert('Unable to load logs', error.message);
    } finally {
      setLoadingLogsList(false);
    }
  };

  useEffect(() => {
    if (!drinkNames.length) {
      if (selectedDrink) {
        setSelectedDrink('');
      }
      return;
    }

    if (!selectedDrink || !drinkNames.includes(selectedDrink)) {
      setSelectedDrink(drinkNames[0]);
    }
  }, [drinkNames, selectedDrink]);

  useEffect(() => {
    if (selectedDrink && recipes[selectedDrink]) {
      setIngredientsText(toMultilineText(recipes[selectedDrink].ingredients));
      setStepsText(toMultilineText(recipes[selectedDrink].steps));
      setRecipeImageUrl(recipes[selectedDrink].imageUrl || '');
    }
  }, [selectedDrink, recipes]);

  useEffect(() => {
    loadStaffPage(staffPage, staffQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffPage, staffQuery]);

  useEffect(() => {
    loadLogPage(logPage, logQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logPage, logQuery]);

  useEffect(() => {
    setAdminRecoveryEmail(adminSettings?.recoveryEmail || '');
  }, [adminSettings]);

  const orderSummary = useMemo(() => summarizeOrders(orders), [orders]);
  const totalRecipes = drinkNames.length;
  const totalStaff = staffMeta.total || staff.length;

  const pickRecipeImageFromDevice = async (setImageValue, slotKey) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission required', 'Enable media library permission to upload an image from your device.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const [asset] = result.assets;
      if (!asset.base64) {
        Alert.alert('Image not supported', 'Could not process this image. Please pick a different one.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${asset.base64}`;

      if (dataUri.length > MAX_RECIPE_IMAGE_LENGTH) {
        Alert.alert('Image too large', 'Please choose a smaller image for this recipe.');
        return;
      }

      setUploadingImageSlot(slotKey);
      const uploaded = await uploadProductImage(dataUri);
      setImageValue(uploaded?.imageUrl || dataUri);

      if (uploaded?.storageProvider === 'cloudinary') {
        Alert.alert('Image uploaded', 'Product image was uploaded to cloud storage successfully.');
      } else {
        Alert.alert('Image attached', 'Cloudinary is not configured, so image is stored inline for now.');
      }
    } catch (error) {
      Alert.alert('Unable to pick image', error.message);
    } finally {
      setUploadingImageSlot('');
    }
  };

  const addNewCoffeeRecipe = async () => {
    const targetDrink = newDrinkName.trim();
    if (!targetDrink) {
      Alert.alert('Missing coffee name', 'Enter a coffee name first.');
      return;
    }

    const exists = drinkNames.some((drink) => drink.toLowerCase() === targetDrink.toLowerCase());
    if (exists) {
      Alert.alert('Coffee already exists', 'That coffee is already in the menu. Use the update section below.');
      return;
    }

    const recipe = {
      ingredients: toListFromMultiline(newIngredientsText),
      steps: toListFromMultiline(newStepsText),
      imageUrl: newRecipeImageUrl.trim(),
    };

    if (!recipe.ingredients.length || !recipe.steps.length) {
      Alert.alert('Invalid recipe', 'Ingredients and steps must each have at least one line.');
      return;
    }

    try {
      setSavingRecipe(true);
      await updateRecipe(targetDrink, recipe);
      setSelectedDrink(targetDrink);
      setNewDrinkName('');
      setNewIngredientsText('');
      setNewStepsText('');
      setNewRecipeImageUrl('');
      Alert.alert('Coffee added', `${targetDrink} and its recipe are now available.`);
    } catch (error) {
      Alert.alert('Unable to add coffee', error.message);
    } finally {
      setSavingRecipe(false);
    }
  };

  const saveRecipeChanges = async () => {
    const targetDrink = selectedDrink;
    if (!targetDrink) {
      Alert.alert('Missing drink name', 'Select a drink first.');
      return;
    }

    const recipe = {
      ingredients: toListFromMultiline(ingredientsText),
      steps: toListFromMultiline(stepsText),
      imageUrl: recipeImageUrl.trim(),
    };

    if (!recipe.ingredients.length || !recipe.steps.length) {
      Alert.alert('Invalid recipe', 'Ingredients and steps must each have at least one line.');
      return;
    }

    try {
      setSavingRecipe(true);
      await updateRecipe(targetDrink, recipe);
      Alert.alert('Recipe updated', `${targetDrink} recipe has been saved.`);
    } catch (error) {
      Alert.alert('Unable to update recipe', error.message);
    } finally {
      setSavingRecipe(false);
    }
  };

  const addStaff = async () => {
    if (!staffName.trim()) {
      Alert.alert('Name required', 'Enter a staff name.');
      return;
    }

    const normalizedEmail = staffEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Valid email required', 'Enter a valid staff email address.');
      return;
    }

    const normalizedPassword = staffPassword.trim();
    if (normalizedPassword.length < 8) {
      Alert.alert('Valid password required', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setAddingStaff(true);
      const created = await addStaffMember({
        name: staffName.trim(),
        role: staffRole,
        email: normalizedEmail,
        password: normalizedPassword,
      });
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
      await loadStaffPage(staffPage, staffQuery);
      await loadLogPage(1, logQuery);
      Alert.alert('Staff created', `${created.name} (${created.role}) account is ready.`);
    } catch (error) {
      Alert.alert('Unable to add staff', error.message);
    } finally {
      setAddingStaff(false);
    }
  };

  const refreshReport = async () => {
    try {
      setReportLoading(true);
      const report = await generateReport();
      setReportSnapshot(report);
    } catch (error) {
      Alert.alert('Unable to generate report', error.message);
    } finally {
      setReportLoading(false);
    }
  };

  const runSelfTest = async () => {
    try {
      setSelfTestLoading(true);
      const result = await runIntegrationSelfTest();
      setSelfTestResult(result || null);
      Alert.alert('Self-test complete', 'Monitoring and realtime checks have been executed.');
    } catch (error) {
      Alert.alert('Self-test failed', error.message);
    } finally {
      setSelfTestLoading(false);
    }
  };

  const onDeleteRecipe = () => {
    if (!selectedDrink) {
      return;
    }

    Alert.alert('Delete recipe', `Delete ${selectedDrink} recipe?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingRecipe(true);
            await removeRecipe(selectedDrink);
          } catch (error) {
            Alert.alert('Unable to delete recipe', error.message);
          } finally {
            setDeletingRecipe(false);
          }
        },
      },
    ]);
  };

  const beginEditStaff = (member) => {
    setEditingStaffId(member.id);
    setEditingStaffName(member.name);
    setEditingStaffEmail(member.email || '');
    setEditingStaffPassword('');
    setEditingStaffRole(member.role);
  };

  const cancelEditStaff = () => {
    setEditingStaffId('');
    setEditingStaffName('');
    setEditingStaffEmail('');
    setEditingStaffPassword('');
    setEditingStaffRole('cashier');
  };

  const saveStaffEdit = async (memberId) => {
    if (!editingStaffName.trim()) {
      Alert.alert('Name required', 'Enter a staff name.');
      return;
    }

    const normalizedEmail = editingStaffEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Valid email required', 'Enter a valid staff email address.');
      return;
    }

    const normalizedPassword = editingStaffPassword.trim();
    if (normalizedPassword && normalizedPassword.length < 8) {
      Alert.alert('Valid password required', 'If provided, password must be at least 8 characters.');
      return;
    }

    try {
      setSavingStaffId(memberId);
      await editStaffMember(memberId, {
        name: editingStaffName.trim(),
        role: editingStaffRole,
        email: normalizedEmail,
        ...(normalizedPassword ? { password: normalizedPassword } : {}),
      });
      cancelEditStaff();
      await loadStaffPage(staffPage, staffQuery);
      await loadLogPage(1, logQuery);
    } catch (error) {
      Alert.alert('Unable to update staff', error.message);
    } finally {
      setSavingStaffId('');
    }
  };

  const saveAdminPassword = async () => {
    if ((currentUser?.role || '') !== 'admin') {
      Alert.alert('Unauthorized', 'Only admin can change this password.');
      return;
    }

    if (adminNewPassword.trim().length < 8) {
      Alert.alert('Invalid password', 'New password must be at least 8 characters.');
      return;
    }

    if (adminNewPassword !== adminConfirmPassword) {
      Alert.alert('Passwords do not match', 'Confirm password must match the new password.');
      return;
    }

    try {
      setSavingAdminPassword(true);
      await updateAdminPassword(adminCurrentPassword.trim(), adminNewPassword.trim());
      setAdminCurrentPassword('');
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      await loadLogPage(1, logQuery);
      Alert.alert('Password updated', 'Admin password was updated successfully.');
    } catch (error) {
      Alert.alert('Unable to update password', error.message);
    } finally {
      setSavingAdminPassword(false);
    }
  };

  const saveRecoveryEmail = async () => {
    const normalizedRecoveryEmail = adminRecoveryEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecoveryEmail)) {
      Alert.alert('Valid recovery email required', 'Enter a valid recovery email for admin password recovery.');
      return;
    }

    try {
      setSavingRecoveryEmail(true);
      await saveAdminRecoveryEmail(normalizedRecoveryEmail);
      await loadLogPage(1, logQuery);
      Alert.alert('Recovery email saved', 'Admin password reset is now enabled for this recovery email.');
    } catch (error) {
      Alert.alert('Unable to save recovery email', error.message);
    } finally {
      setSavingRecoveryEmail(false);
    }
  };

  const toggleStaffActive = async (member) => {
    try {
      setTogglingStaffId(member.id);
      await setStaffActive(member.id, !member.active);
      await loadStaffPage(staffPage, staffQuery);
      await loadLogPage(1, logQuery);
    } catch (error) {
      Alert.alert('Unable to update staff status', error.message);
    } finally {
      setTogglingStaffId('');
    }
  };

  const onDeleteStaffMember = (staffId, name) => {
    Alert.alert('Delete staff member', `Delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingStaffId(staffId);
            await removeStaffMember(staffId);
            if (editingStaffId === staffId) {
              cancelEditStaff();
            }
            await loadStaffPage(staffPage, staffQuery);
            await loadLogPage(1, logQuery);
          } catch (error) {
            Alert.alert('Unable to delete staff', error.message);
          } finally {
            setDeletingStaffId('');
          }
        },
      },
    ]);
  };

  const resetStaffPassword = async (member) => {
    const tempPassword = `${member.role}${Math.floor(100000 + Math.random() * 900000)}!`;

    try {
      setSavingStaffId(member.id);
      await editStaffMember(member.id, {
        name: member.name,
        role: member.role,
        email: member.email,
        password: tempPassword,
      });
      await loadStaffPage(staffPage, staffQuery);
      await loadLogPage(1, logQuery);
      Alert.alert('Password reset', `${member.name}'s temporary password is: ${tempPassword}`);
    } catch (error) {
      Alert.alert('Unable to reset password', error.message);
    } finally {
      setSavingStaffId('');
    }
  };

  const applyStaffSearch = () => {
    setStaffPage(1);
    setStaffQuery(staffQueryInput.trim());
  };

  const clearStaffSearch = () => {
    setStaffQueryInput('');
    setStaffPage(1);
    setStaffQuery('');
  };

  const applyLogSearch = () => {
    setLogPage(1);
    setLogQuery(logQueryInput.trim());
  };

  const clearLogSearch = () => {
    setLogQueryInput('');
    setLogPage(1);
    setLogQuery('');
  };

  const dashboardLinks = SIDEBAR_LINKS.filter((link) => link.group === 'dashboard');
  const managementLinks = SIDEBAR_LINKS.filter((link) => link.group === 'management');

  const activePanelTitle = useMemo(() => {
    const found = SIDEBAR_LINKS.find((link) => link.key === activePanel);
    return found ? found.label : 'Overview Dashboard';
  }, [activePanel]);

  const openPanel = (panelKey) => {
    setActivePanel(panelKey);
    setShowControlMap(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.workspace}>
        <View style={styles.menuDock}>
          <Pressable style={styles.menuToggle} onPress={() => setShowControlMap((prev) => !prev)}>
            <View style={styles.menuIconWrap}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </View>
            <Text style={styles.menuToggleText}>Control Map</Text>
          </Pressable>
        </View>

        {showControlMap ? (
          <>
            <Pressable style={styles.menuBackdrop} onPress={() => setShowControlMap(false)} />
            <View style={styles.menuPanel}>
              <Text style={styles.sidebarEyebrow}>Control Map</Text>
              <Text style={styles.sidebarTitle}>Admin Console</Text>

              <Text style={styles.sidebarGroupLabel}>Dashboard</Text>
              <View style={styles.sidebarButtonWrap}>
                {dashboardLinks.map((link) => (
                  <SidebarButton key={link.key} label={link.label} active={activePanel === link.key} onPress={() => openPanel(link.key)} />
                ))}
              </View>

              <Text style={styles.sidebarGroupLabel}>Management</Text>
              <View style={styles.sidebarButtonWrap}>
                {managementLinks.map((link) => (
                  <SidebarButton key={link.key} label={link.label} active={activePanel === link.key} onPress={() => openPanel(link.key)} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>Industrial Operations Console</Text>
            <Text style={styles.heroSubtitle}>Production-grade controls for recipes, staff, and floor analytics</Text>

            <View style={styles.heroQuickRow}>
              <View style={styles.heroQuickChip}>
                <Text style={styles.heroQuickLabel}>Staff</Text>
                <Text style={styles.heroQuickValue}>{totalStaff}</Text>
              </View>
              <View style={styles.heroQuickChip}>
                <Text style={styles.heroQuickLabel}>Recipes</Text>
                <Text style={styles.heroQuickValue}>{totalRecipes}</Text>
              </View>
              <View style={styles.heroQuickChip}>
                <Text style={styles.heroQuickLabel}>Active Orders</Text>
                <Text style={styles.heroQuickValue}>{orderSummary.pending + orderSummary['in-progress']}</Text>
              </View>
            </View>
          </View>

          <View style={styles.quickNavWrap}>
            {SIDEBAR_LINKS.map((link) => (
              <Pressable
                key={link.key}
                style={[styles.quickNavButton, activePanel === link.key && styles.quickNavButtonActive]}
                onPress={() => openPanel(link.key)}
              >
                <Text style={[styles.quickNavButtonText, activePanel === link.key && styles.quickNavButtonTextActive]}>{link.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.panelHeaderRow}>
            <Text style={styles.sectionTitle}>{activePanelTitle}</Text>
            <Text style={styles.panelHint}>Choose a panel from the quick navigation above.</Text>
          </View>

          {activePanel === ADMIN_PANELS.overview ? (
            <>
              <View style={styles.realtimeIndicator}>
                <View style={[styles.realtimeDot, realtimeStatus?.state === 'connected' ? styles.realtimeDotActive : styles.realtimeDotInactive]} />
                <Text style={styles.realtimeText}>{realtimeStatus?.message || 'Realtime offline'}</Text>
              </View>

              <View style={[styles.panel, styles.metricsGrid]}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Total Sales Today</Text>
                  <Text style={styles.metricValue}>${(dashboardMetrics.totalSalesToday || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Queue Count</Text>
                  <Text style={styles.metricValue}>{dashboardMetrics.currentQueueCount}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Active Baristas</Text>
                  <Text style={styles.metricValue}>{dashboardMetrics.activeBaristas}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Active Cashiers</Text>
                  <Text style={styles.metricValue}>{dashboardMetrics.activeCashiers}</Text>
                </View>
              </View>

              <View style={[styles.panel, styles.metricsGrid]}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Pending Orders</Text>
                  <Text style={styles.metricValue}>{dashboardMetrics.pendingOrders}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Completed Today</Text>
                  <Text style={styles.metricValue}>{dashboardMetrics.completedOrders}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>In-Progress</Text>
                  <Text style={styles.metricValue}>{orderSummary['in-progress']}</Text>
                </View>
                <View style={styles.metricCardWide}>
                  <Text style={styles.metricLabel}>Audit Entries</Text>
                  <Text style={styles.metricValue}>{logsMeta.total}</Text>
                </View>
              </View>

              {dashboardMetrics.mostSoldDrinks.length > 0 ? (
                <View style={styles.panel}>
                  <Text style={styles.panelSubtitle}>Most Sold Drinks Today</Text>
                  <View style={styles.drinkList}>
                    {dashboardMetrics.mostSoldDrinks.map((drink, index) => (
                      <View key={index} style={styles.drinkItem}>
                        <Text style={styles.drinkRank}>#{index + 1}</Text>
                        <Text style={styles.drinkName}>{drink.name}</Text>
                        <Text style={styles.drinkCount}>{drink.count} sold</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {dashboardMetrics.recentOrders.length > 0 ? (
                <View style={styles.panel}>
                  <Text style={styles.panelSubtitle}>Recent Orders</Text>
                  <View style={styles.recentOrdersList}>
                    {dashboardMetrics.recentOrders.slice(0, 5).map((order) => (
                      <View key={order.id} style={styles.recentOrderItem}>
                        <View style={styles.orderInfo}>
                          <Text style={styles.orderItem}>{order.item}</Text>
                          <Text style={styles.orderTime}>{formatTimestamp(order.createdAt)}</Text>
                        </View>
                        <Text style={[styles.orderStatus, order.status === 'completed' && styles.orderStatusCompleted]}>{order.status}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <ActionButton label="Generate Report Snapshot" onPress={refreshReport} loading={reportLoading} />
              {reportSnapshot ? (
                <Text style={styles.reportMeta}>Report generated at {formatTimestamp(reportSnapshot.generatedAt)}</Text>
              ) : null}

              <ActionButton label="Run Monitoring + Queue Self-Test" onPress={runSelfTest} loading={selfTestLoading} />
              {selfTestResult ? (
                <Text style={styles.reportMeta}>
                  Self-test {formatTimestamp(selfTestResult.checkedAt)} | Sentry: {selfTestResult.sentryEnabled ? 'ON' : 'OFF'} | Pusher: {selfTestResult.pusherConfigured ? 'Configured' : 'Missing'} | Event: {selfTestResult.pusherTriggered ? 'Sent' : 'Not Sent'}
                </Text>
              ) : null}
            </>
          ) : null}

          {activePanel === ADMIN_PANELS.recipes ? (
            <View style={styles.panel}>
              <View style={styles.recipeToolsGrid}>
                <View style={styles.recipeBlockCard}>
                  <Text style={styles.recipeBlockTitle}>Add New Product + Recipe</Text>
                  <Text style={styles.recipeBlockHint}>Create a new menu product with ingredients, preparation steps, and image.</Text>

                  <Text style={styles.fieldLabel}>Product Name</Text>
                  <TextInput
                    value={newDrinkName}
                    onChangeText={setNewDrinkName}
                    placeholder="Example: Flat White"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />

                  <Text style={styles.fieldLabel}>Ingredients (one per line)</Text>
                  <TextInput
                    value={newIngredientsText}
                    onChangeText={setNewIngredientsText}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />

                  <Text style={styles.fieldLabel}>Product Image (from device)</Text>
                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Upload To Cloud"
                      onPress={() => pickRecipeImageFromDevice(setNewRecipeImageUrl, 'new')}
                      loading={uploadingImageSlot === 'new'}
                    />
                    <Pressable style={[styles.actionButton, styles.ghostButton]} onPress={() => setNewRecipeImageUrl('')}>
                      <Text style={styles.ghostButtonText}>Clear Image</Text>
                    </Pressable>
                  </View>
                  {newRecipeImageUrl ? (
                    <Image source={{ uri: newRecipeImageUrl }} style={styles.recipeImagePreview} resizeMode="cover" />
                  ) : (
                    <Text style={styles.emptyMeta}>No image selected yet.</Text>
                  )}

                  <Text style={styles.fieldLabel}>Steps (one per line)</Text>
                  <TextInput value={newStepsText} onChangeText={setNewStepsText} multiline style={[styles.input, styles.textArea]} />

                  <ActionButton label="Add Product + Recipe" onPress={addNewCoffeeRecipe} loading={savingRecipe} />
                </View>

                <View style={styles.recipeBlockCard}>
                  <Text style={styles.recipeBlockTitle}>Update Existing Product</Text>
                  <Text style={styles.recipeBlockHint}>Select an existing product to edit ingredients, steps, and image.</Text>

                  <Text style={styles.fieldLabel}>Select Existing Drink</Text>
                  <View style={styles.optionWrap}>
                    {drinkNames.map((drink) => (
                      <RoleChip key={drink} role={drink} active={selectedDrink === drink} onPress={() => setSelectedDrink(drink)} />
                    ))}
                  </View>

                  {!drinkNames.length ? <Text style={styles.emptyMeta}>No products yet. Add one above.</Text> : null}

                  <Text style={styles.fieldLabel}>Ingredients (one per line)</Text>
                  <TextInput
                    value={ingredientsText}
                    onChangeText={setIngredientsText}
                    multiline
                    style={[styles.input, styles.textArea]}
                  />

                  <Text style={styles.fieldLabel}>Product Image (from device)</Text>
                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Replace In Cloud"
                      onPress={() => pickRecipeImageFromDevice(setRecipeImageUrl, 'edit')}
                      loading={uploadingImageSlot === 'edit'}
                      disabled={!selectedDrink}
                    />
                    <Pressable
                      style={[styles.actionButton, styles.ghostButton]}
                      onPress={() => setRecipeImageUrl('')}
                      disabled={!selectedDrink}
                    >
                      <Text style={styles.ghostButtonText}>Remove Image</Text>
                    </Pressable>
                  </View>
                  {recipeImageUrl ? (
                    <Image source={{ uri: recipeImageUrl }} style={styles.recipeImagePreview} resizeMode="cover" />
                  ) : (
                    <Text style={styles.emptyMeta}>No image selected for this coffee.</Text>
                  )}

                  <Text style={styles.fieldLabel}>Steps (one per line)</Text>
                  <TextInput value={stepsText} onChangeText={setStepsText} multiline style={[styles.input, styles.textArea]} />

                  <View style={styles.actionRow}>
                    <ActionButton label="Update Recipe" onPress={saveRecipeChanges} loading={savingRecipe} disabled={!selectedDrink} />
                    <ActionButton
                      label="Delete Recipe"
                      onPress={onDeleteRecipe}
                      loading={deletingRecipe}
                      disabled={!selectedDrink}
                      tone="danger"
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {activePanel === ADMIN_PANELS.settings ? (
            <View style={styles.panel}>
              <Text style={styles.subSectionTitle}>Admin Security</Text>
              <Text style={styles.sectionHelp}>Only the admin account can change its own password from this console.</Text>

              <View style={styles.settingsToolsGrid}>
                <View style={styles.settingsBlockCard}>
                  <Text style={styles.settingsBlockTitle}>Recovery Configuration</Text>
                  <Text style={styles.settingsBlockHint}>Enable secure forgot-password reset delivery for the admin account.</Text>

                  <Text style={styles.fieldLabel}>Recovery Email</Text>
                  <TextInput
                    value={adminRecoveryEmail}
                    onChangeText={setAdminRecoveryEmail}
                    placeholder="Input your Email"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <ActionButton
                    label={adminSettings?.recoveryEmailConfigured ? 'Update Recovery Email' : 'Set Recovery Email'}
                    onPress={saveRecoveryEmail}
                    loading={savingRecoveryEmail}
                  />
                  <Text style={styles.settingsNoteText}>Forgot-password works only when this recovery email is configured.</Text>
                </View>

                <View style={styles.settingsBlockCard}>
                  <Text style={styles.settingsBlockTitle}>Change Admin Password</Text>
                  <Text style={styles.settingsBlockHint}>Rotate credentials periodically to maintain account security.</Text>

                  <Text style={styles.fieldLabel}>Current Admin Password</Text>
                  <TextInput
                    value={adminCurrentPassword}
                    onChangeText={setAdminCurrentPassword}
                    placeholder="Current password"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    secureTextEntry
                  />

                  <Text style={styles.fieldLabel}>New Admin Password</Text>
                  <TextInput
                    value={adminNewPassword}
                    onChangeText={setAdminNewPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    secureTextEntry
                  />

                  <Text style={styles.fieldLabel}>Confirm New Password</Text>
                  <TextInput
                    value={adminConfirmPassword}
                    onChangeText={setAdminConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    secureTextEntry
                  />

                  <ActionButton label="Update Admin Password" onPress={saveAdminPassword} loading={savingAdminPassword} />
                  <Text style={styles.settingsNoteText}>Cashier and barista password recovery remains managed through staff controls.</Text>
                </View>
              </View>
            </View>
          ) : null}

          {activePanel === ADMIN_PANELS.staff ? (
            <View style={styles.panel}>
              <Text style={styles.subSectionTitle}>Staff Accounts</Text>
              <Text style={styles.sectionHelp}>Create cashier and barista accounts here. Password changes are admin-only.</Text>

              <View style={styles.staffToolsGrid}>
                <View style={styles.staffBlockCard}>
                  <Text style={styles.staffBlockTitle}>Find Staff</Text>
                  <Text style={styles.staffBlockHint}>Search by name, email, id, or role.</Text>

                  <Text style={styles.fieldLabel}>Search Staff</Text>
                  <TextInput
                    value={staffQueryInput}
                    onChangeText={setStaffQueryInput}
                    placeholder="Search by name, email, id, or role"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  <View style={styles.actionRow}>
                    <ActionButton label="Apply Staff Search" onPress={applyStaffSearch} />
                    <Pressable style={[styles.actionButton, styles.ghostButton]} onPress={clearStaffSearch}>
                      <Text style={styles.ghostButtonText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.staffBlockCard}>
                  <Text style={styles.staffBlockTitle}>Create Account</Text>
                  <Text style={styles.staffBlockHint}>Add staff with a temporary password, then assign role access.</Text>

                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <TextInput
                    value={staffName}
                    onChangeText={setStaffName}
                    placeholder="Staff Name"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />

                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    value={staffEmail}
                    onChangeText={setStaffEmail}
                    placeholder="Input your Email"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={styles.fieldLabel}>Temporary Password</Text>
                  <TextInput
                    value={staffPassword}
                    onChangeText={setStaffPassword}
                    placeholder="Temporary password (8+ characters)"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    secureTextEntry
                  />

                  <Text style={styles.fieldLabel}>Role</Text>
                  <View style={styles.optionWrap}>
                    {ROLE_OPTIONS.map((role) => (
                      <RoleChip key={role} role={role} active={staffRole === role} onPress={() => setStaffRole(role)} />
                    ))}
                  </View>

                  <ActionButton label="Add Staff Member" onPress={addStaff} loading={addingStaff} />
                </View>
              </View>

              <View style={styles.pagerRow}>
                <Pressable
                  style={[styles.smallButton, staffPage <= 1 && styles.disabledButton]}
                  disabled={staffPage <= 1 || loadingStaffList}
                  onPress={() => setStaffPage((prev) => Math.max(1, prev - 1))}
                >
                  <Text style={styles.smallButtonText}>Prev</Text>
                </Pressable>
                <Text style={styles.pagerText}>
                  Page {staffMeta.page} of {staffMeta.totalPages} · {staffMeta.total} staff
                </Text>
                <Pressable
                  style={[styles.smallButton, staffPage >= staffMeta.totalPages && styles.disabledButton]}
                  disabled={staffPage >= staffMeta.totalPages || loadingStaffList}
                  onPress={() => setStaffPage((prev) => Math.min(staffMeta.totalPages, prev + 1))}
                >
                  <Text style={styles.smallButtonText}>Next</Text>
                </Pressable>
              </View>

              {loadingStaffList ? <ActivityIndicator color={colors.accent} style={styles.inlineLoader} /> : null}

              <FlatList
                data={staff}
                keyExtractor={(member) => member.id}
                scrollEnabled={false}
                contentContainerStyle={styles.staffList}
                renderItem={({ item: member }) => (
                  <View style={styles.staffRowCard}>
                    <View style={styles.staffHeader}>
                      <View style={styles.staffIdentityWrap}>
                        <Text style={styles.staffName}>{member.name}</Text>
                        <Text style={styles.staffRoleText}>{member.role}</Text>
                      </View>
                      <Text style={[styles.staffStatus, !member.active && styles.staffStatusMuted]}>
                        {member.active ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>

                    <View style={styles.staffMetaBlock}>
                      <Text style={styles.staffMetaText}>Email: {member.email || 'N/A'}</Text>
                      <Text style={styles.staffMetaText}>Password: managed by admin</Text>
                    </View>

                    <View style={styles.staffActionRow}>
                      <Pressable style={styles.smallButton} onPress={() => beginEditStaff(member)}>
                        <Text style={styles.smallButtonText}>Edit</Text>
                      </Pressable>

                      <ActionButton
                        label={member.active ? 'Deactivate' : 'Activate'}
                        onPress={() => toggleStaffActive(member)}
                        loading={togglingStaffId === member.id}
                        disabled={Boolean(togglingStaffId && togglingStaffId !== member.id)}
                        tone={member.active ? 'danger' : 'primary'}
                      />

                      <ActionButton
                        label="Reset Password"
                        onPress={() => resetStaffPassword(member)}
                        loading={savingStaffId === member.id}
                        disabled={Boolean(savingStaffId && savingStaffId !== member.id)}
                      />

                      <ActionButton
                        label="Delete"
                        onPress={() => onDeleteStaffMember(member.id, member.name)}
                        loading={deletingStaffId === member.id}
                        disabled={Boolean(deletingStaffId && deletingStaffId !== member.id)}
                        tone="danger"
                      />
                    </View>

                    {editingStaffId === member.id ? (
                      <View style={styles.inlineEditor}>
                        <Text style={styles.staffBlockTitle}>Edit Staff Account</Text>
                        <Text style={styles.fieldLabel}>Edit Name</Text>
                        <TextInput value={editingStaffName} onChangeText={setEditingStaffName} style={styles.input} />

                        <Text style={styles.fieldLabel}>Edit Role</Text>
                        <View style={styles.optionWrap}>
                          {ROLE_OPTIONS.map((role) => (
                            <RoleChip key={role} role={role} active={editingStaffRole === role} onPress={() => setEditingStaffRole(role)} />
                          ))}
                        </View>

                        <Text style={styles.fieldLabel}>Edit Email</Text>
                        <TextInput
                          value={editingStaffEmail}
                          onChangeText={setEditingStaffEmail}
                          placeholder="Input your Email"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />

                        <Text style={styles.fieldLabel}>Set New Password (optional)</Text>
                        <TextInput
                          value={editingStaffPassword}
                          onChangeText={setEditingStaffPassword}
                          placeholder="Leave blank to keep current"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          secureTextEntry
                        />

                        <View style={styles.actionRow}>
                          <ActionButton label="Save Changes" onPress={() => saveStaffEdit(member.id)} loading={savingStaffId === member.id} />
                          <Pressable style={[styles.actionButton, styles.ghostButton]} onPress={cancelEditStaff}>
                            <Text style={styles.ghostButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}
              />

              {!loadingStaffList && !staff.length ? <Text style={styles.logMeta}>No staff records for this query.</Text> : null}
            </View>
          ) : null}

          {activePanel === ADMIN_PANELS.logs ? (
            <View style={[styles.panel, styles.logsPanel]}>
              <Text style={styles.fieldLabel}>Search Logs</Text>
              <TextInput
                value={logQueryInput}
                onChangeText={setLogQueryInput}
                placeholder="Search action, actor, or details"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <View style={styles.actionRow}>
                <ActionButton label="Apply Log Search" onPress={applyLogSearch} />
                <Pressable style={[styles.actionButton, styles.ghostButton]} onPress={clearLogSearch}>
                  <Text style={styles.ghostButtonText}>Clear</Text>
                </Pressable>
              </View>

              <View style={styles.pagerRow}>
                <Pressable
                  style={[styles.smallButton, logPage <= 1 && styles.disabledButton]}
                  disabled={logPage <= 1 || loadingLogsList}
                  onPress={() => setLogPage((prev) => Math.max(1, prev - 1))}
                >
                  <Text style={styles.smallButtonText}>Prev</Text>
                </Pressable>
                <Text style={styles.pagerText}>
                  Page {logsMeta.page} of {logsMeta.totalPages} · {logsMeta.total} logs
                </Text>
                <Pressable
                  style={[styles.smallButton, logPage >= logsMeta.totalPages && styles.disabledButton]}
                  disabled={logPage >= logsMeta.totalPages || loadingLogsList}
                  onPress={() => setLogPage((prev) => Math.min(logsMeta.totalPages, prev + 1))}
                >
                  <Text style={styles.smallButtonText}>Next</Text>
                </Pressable>
              </View>

              {loadingLogsList ? <ActivityIndicator color={colors.accent} style={styles.inlineLoader} /> : null}

              {logs.length ? (
                logs.map((entry) => (
                  <View key={entry.id} style={styles.logRow}>
                    <Text style={styles.logAction}>{entry.action}</Text>
                    <Text style={styles.logMeta}>
                      {entry.actor} · {formatTimestamp(entry.timestamp)}
                    </Text>
                    <Text style={styles.logMeta}>{entry.details}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.logMeta}>No logs yet.</Text>
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  workspace: {
    flex: 1,
    padding: spacing.md,
    position: 'relative',
  },
  menuDock: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    zIndex: 30,
  },
  menuToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.panelRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 2,
  },
  menuToggleText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  menuIconWrap: {
    width: 18,
    gap: 3,
  },
  menuLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.backdrop,
    zIndex: 15,
  },
  menuPanel: {
    position: 'absolute',
    left: spacing.md,
    top: 58,
    width: 230,
    backgroundColor: colors.panelRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    zIndex: 25,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 5,
  },
  sidebarEyebrow: {
    color: colors.accentDark,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontSize: 11,
    fontWeight: '700',
  },
  sidebarTitle: {
    color: colors.text,
    fontSize: 23,
    fontFamily: typography.display,
    fontWeight: '800',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  sidebarGroupLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sidebarButtonWrap: {
    gap: spacing.xs,
  },
  sidebarButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  sidebarButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accentDark,
  },
  sidebarButtonText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  sidebarButtonTextActive: {
    color: colors.white,
  },
  mainScroll: {
    flex: 1,
    marginTop: 54,
  },
  mainContent: {
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 1220,
    alignSelf: 'center',
    paddingHorizontal: spacing.xs,
  },
  heroPanel: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentDark,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 4,
  },
  panelHeaderRow: {
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.inkInverse,
    fontSize: 30,
    fontFamily: typography.display,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: colors.heroSubtle,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  heroQuickRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroQuickChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  heroQuickLabel: {
    color: colors.heroSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    fontWeight: '700',
  },
  heroQuickValue: {
    color: colors.white,
    marginTop: 2,
    fontSize: 18,
    fontFamily: typography.heading,
    fontWeight: '800',
  },
  quickNavWrap: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickNavButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: spacing.xs,
    backgroundColor: colors.panel,
  },
  quickNavButtonActive: {
    borderColor: colors.accentDark,
    backgroundColor: colors.accent,
  },
  quickNavButtonText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 12,
  },
  quickNavButtonTextActive: {
    color: colors.white,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontFamily: typography.heading,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  panelHint: {
    color: colors.muted,
    marginTop: 2,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 2,
  },
  recipeToolsGrid: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  recipeBlockCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  recipeBlockTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '800',
    fontSize: 16,
  },
  recipeBlockHint: {
    color: colors.muted,
    marginTop: spacing.xxs,
    lineHeight: 20,
  },
  settingsToolsGrid: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  settingsBlockCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  settingsBlockTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '800',
    fontSize: 16,
  },
  settingsBlockHint: {
    color: colors.muted,
    marginTop: spacing.xxs,
    lineHeight: 20,
  },
  settingsNoteText: {
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  staffToolsGrid: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  staffBlockCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  staffBlockTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '800',
    fontSize: 14,
  },
  staffBlockHint: {
    color: colors.muted,
    marginTop: spacing.xxs,
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricCardWide: {
    width: '100%',
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: colors.text,
    marginTop: 4,
    fontFamily: typography.heading,
    fontWeight: '800',
    fontSize: 22,
  },
  reportMeta: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.muted,
  },
  subSectionTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHelp: {
    marginTop: 2,
    color: colors.muted,
  },
  sectionDivider: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyMeta: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  fieldLabel: {
    color: colors.muted,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    minHeight: 38,
    paddingVertical: spacing.xs,
    backgroundColor: colors.panelMuted,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 46,
    color: colors.text,
    backgroundColor: colors.panel,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  recipeImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pagerText: {
    color: colors.muted,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    flex: 1,
  },
  actionText: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    opacity: 0.55,
  },
  ghostButton: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  },
  ghostButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  staffRowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.panel,
  },
  staffList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  staffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  staffIdentityWrap: {
    gap: spacing.xxs,
  },
  staffName: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '800',
    fontSize: 16,
  },
  staffRoleText: {
    color: colors.accentDark,
    textTransform: 'capitalize',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  staffMetaBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xxs,
  },
  staffMetaText: {
    color: colors.text,
    fontWeight: '600',
  },
  staffStatus: {
    color: colors.success,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.34)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  staffStatusMuted: {
    color: colors.muted,
    backgroundColor: colors.panelMuted,
    borderColor: colors.border,
  },
  staffActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  smallButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
  },
  inlineLoader: {
    marginTop: spacing.sm,
  },
  inlineEditor: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xxs,
  },
  smallButtonText: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  logsPanel: {
    marginBottom: spacing.xl,
  },
  logRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  logAction: {
    color: colors.text,
    fontWeight: '700',
  },
  logMeta: {
    color: colors.muted,
    marginTop: 2,
  },
  realtimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panelMuted,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  realtimeDotActive: {
    backgroundColor: '#22c55e',
  },
  realtimeDotInactive: {
    backgroundColor: colors.muted,
  },
  realtimeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  panelSubtitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  drinkList: {
    gap: spacing.xs,
  },
  drinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drinkRank: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
    width: 30,
  },
  drinkName: {
    color: colors.text,
    fontWeight: '600',
    flex: 1,
  },
  drinkCount: {
    color: colors.muted,
    fontSize: 12,
  },
  recentOrdersList: {
    gap: spacing.xs,
  },
  recentOrderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderInfo: {
    flex: 1,
  },
  orderItem: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  orderTime: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  orderStatus: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: colors.panelMuted,
    borderRadius: radius.sm,
  },
  orderStatusCompleted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
});
