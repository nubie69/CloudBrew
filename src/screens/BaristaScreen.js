import React, { useMemo, useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '../assets/styles/theme';
import OrderCard from '../components/OrderCard';
import RecipeGuide from '../components/RecipeGuide';
import { useUser } from '../context/UserContext';
import { ORDER_STATUS } from '../utils/helpers';
import { fetchBaristaAnalytics, formatPrepTime, getPerformanceTier } from '../services/baristaAnalytics';
import { connectQueueSocket, disconnectQueueSocket, subscribeToQueueEvents } from '../services/queueSocket';
import { getApiUrl } from '../services/http';

const BARISTA_VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'analytics', label: 'Analytics' },
];

export default function BaristaScreen() {
  const { orders = [], recipes = {}, setOrderStatus, currentUser, realtimeStatus } = useUser() || {};
  const [activeView, setActiveView] = useState('all');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (!currentUser?.token) return;

    const init = async () => {
      try {
        const apiUrl = getApiUrl();
        const ok = await connectQueueSocket(apiUrl, currentUser.token);
        if (!mounted) return;
        setSocketConnected(Boolean(ok));
      } catch (err) {
        console.error('Socket init failed', err);
      }
    };

    init();

    const unsubscribe = subscribeToQueueEvents((ev) => {
      if (ev.type === 'connection') setSocketConnected(ev.state === 'connected');
    });

    return () => {
      mounted = false;
      unsubscribe && unsubscribe();
      disconnectQueueSocket();
    };
  }, [currentUser?.token]);

  useEffect(() => {
    if (activeView !== 'analytics' || analytics) return;
    setAnalyticsLoading(true);
    fetchBaristaAnalytics()
      .then((d) => setAnalytics(d))
      .catch((e) => console.error('Fetch analytics failed', e))
      .finally(() => setAnalyticsLoading(false));
  }, [activeView, analytics]);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== ORDER_STATUS.COMPLETED).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [orders]
  );

  const completeOrders = useMemo(
    () => orders.filter((o) => o.status === ORDER_STATUS.COMPLETED).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [orders]
  );
  const liveQueueCount = activeOrders.length;
  const liveQueueLabel = socketConnected ? 'Live Queue Active' : realtimeStatus?.message || 'Live Queue Offline';

  const startOrder = (id) => setOrderStatus && setOrderStatus(id, ORDER_STATUS.IN_PROGRESS);
  const completeOrder = (id) => setOrderStatus && setOrderStatus(id, ORDER_STATUS.COMPLETED);
  const selectedRecipe = selectedOrder ? recipes[selectedOrder.item] : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Barista Board</Text>
        <View style={styles.liveQueueBadge}>
          <View style={[styles.liveDot, socketConnected && styles.liveDotActive]} />
          <Text style={styles.liveQueueText}>{liveQueueLabel}</Text>
          <Text style={styles.liveQueueCount}>{liveQueueCount} orders</Text>
        </View>
        <Text style={styles.subtitle}>{socketConnected ? 'Realtime updates are streaming in now.' : 'Waiting for realtime queue updates.'}</Text>
      </View>

      <View style={styles.viewSwitch}>
        {BARISTA_VIEWS.map((v) => (
          <Pressable key={v.key} onPress={() => setActiveView(v.key)} style={[styles.viewButton, activeView === v.key && styles.viewButtonActive]}>
            <Text style={[styles.viewButtonText, activeView === v.key && styles.viewButtonTextActive]}>{v.label}</Text>
          </Pressable>
        ))}
      </View>

      {(activeView === 'all' || activeView === 'active') && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Active Queue</Text>
          {activeOrders.length ? (
            activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                recipe={recipes[order.item]}
                actions={[
                  ...(order.status === ORDER_STATUS.PENDING ? [{ label: 'Start', onPress: () => startOrder(order.id) }] : []),
                  ...(order.status === ORDER_STATUS.IN_PROGRESS ? [{ label: 'Complete', onPress: () => completeOrder(order.id) }] : []),
                ]}
                onShowRecipe={() => setSelectedOrder(order)}
              />
            ))
          ) : (
            <Text style={styles.empty}>No active orders</Text>
          )}
        </View>
      )}

      {(activeView === 'all' || activeView === 'completed') && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Completed</Text>
          {completeOrders.length ? (
            completeOrders.slice(0, 8).map((o) => <OrderCard key={o.id} order={o} recipe={recipes[o.item]} />)
          ) : (
            <Text style={styles.empty}>No completed orders</Text>
          )}
        </View>
      )}

      {activeView === 'analytics' && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Analytics</Text>
          {analyticsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : analytics ? (
            <View>
              <Text>Completed Orders: {analytics.myStats?.completedOrders ?? 0}</Text>
              <Text>Avg Prep: {formatPrepTime(analytics.myStats?.avgPrepMinutes ?? 0)}</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No analytics available</Text>
          )}
        </View>
      )}

      <RecipeGuide visible={Boolean(selectedOrder)} order={selectedOrder} recipe={selectedRecipe} onClose={() => setSelectedOrder(null)} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: 120 },
  header: { marginBottom: spacing.md },
  title: { fontSize: 24, fontFamily: typography.heading, fontWeight: '700' },
  liveQueueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.panel,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: colors.muted,
  },
  liveDotActive: {
    backgroundColor: colors.success,
  },
  liveQueueText: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  liveQueueCount: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '600',
  },
  subtitle: { color: colors.muted, marginTop: 6 },
  viewSwitch: { flexDirection: 'row', marginBottom: spacing.md },
  viewButton: { padding: 8, marginRight: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  viewButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  viewButtonText: { color: colors.text },
  viewButtonTextActive: { color: '#fff' },
  panel: { marginBottom: spacing.lg },
  panelTitle: { fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  empty: { color: colors.muted },
});
