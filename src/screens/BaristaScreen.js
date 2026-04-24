import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import OrderCard from '../components/OrderCard';
import RecipeGuide from '../components/RecipeGuide';
import { useUser } from '../context/UserContext';
import { subscribeToOrders } from '../services/notifications';
import { ORDER_STATUS } from '../utils/helpers';

export default function BaristaScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1080;
  const { orders, recipes, setOrderStatus, currentUser } = useUser();
  const [notice, setNotice] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  React.useEffect(() => {
    const unsubscribe = subscribeToOrders((order) => {
      setNotice(`New order received: ${order.id}`);
      setTimeout(() => setNotice(''), 3500);
    });

    return unsubscribe;
  }, []);

  const activeOrders = useMemo(
    () =>
      [...orders]
        .filter((order) => order.status !== ORDER_STATUS.COMPLETED)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [orders]
  );

  const completeOrders = useMemo(
    () =>
      [...orders]
        .filter((order) => order.status === ORDER_STATUS.COMPLETED)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [orders]
  );

  const activeDrinksCount = useMemo(
    () => activeOrders.reduce((sum, order) => sum + (order.quantity || 1), 0),
    [activeOrders]
  );

  const completedDrinksCount = useMemo(
    () => completeOrders.reduce((sum, order) => sum + (order.quantity || 1), 0),
    [completeOrders]
  );

  const inProgressCount = useMemo(
    () => activeOrders.filter((order) => order.status === ORDER_STATUS.IN_PROGRESS).length,
    [activeOrders]
  );

  const pendingCount = useMemo(
    () => activeOrders.filter((order) => order.status === ORDER_STATUS.PENDING).length,
    [activeOrders]
  );

  const getInProgressMinutes = (order) => {
    if (order.status !== ORDER_STATUS.IN_PROGRESS || !order.updatedAt) {
      return 0;
    }
    return Math.max(0, Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 60000));
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Barista Board</Text>
          <Text style={styles.heroTitle}>Production Rail</Text>
          <Text style={styles.heroSubtitle}>Prioritize active drinks and close out completed tickets quickly.</Text>
          <Text style={styles.welcomeText}>Welcome, {currentUser?.name || 'Barista'}</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatLabel}>Active</Text>
              <Text style={styles.heroStatValue}>{activeOrders.length}</Text>
              <Text style={styles.heroStatSubValue}>{activeDrinksCount} drinks</Text>
            </View>
            <View style={styles.heroStatPill}>
              <Text style={styles.heroStatLabel}>Completed</Text>
              <Text style={styles.heroStatValue}>{completeOrders.length}</Text>
              <Text style={styles.heroStatSubValue}>{completedDrinksCount} drinks</Text>
            </View>
          </View>

          <View style={styles.productionStrip}>
            <Text style={styles.productionStripText}>Pending: {pendingCount}</Text>
            <Text style={styles.productionStripText}>In Progress: {inProgressCount}</Text>
          </View>
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={[styles.queueGrid, isWide && styles.queueGridWide]}>
          <View style={styles.queueColumn}>
            <Text style={styles.sectionTitle}>Active Queue</Text>
            <View style={styles.sectionCard}>
              {activeOrders.length ? (
                activeOrders.map((order) => {
                  const recipe = recipes[order.item];
                  const actions = [];
                  const isAssignedToMe = order.handledBy === currentUser?.name;
                  const inProgressMinutes = getInProgressMinutes(order);
                  const ownershipNotice =
                    order.status === ORDER_STATUS.IN_PROGRESS
                      ? `In progress by ${order.handledBy || 'Unassigned'}${inProgressMinutes ? ` · ${inProgressMinutes}m` : ''}`
                      : 'Pending · Unassigned';

                  if (order.status === ORDER_STATUS.PENDING) {
                    actions.push({ label: 'Start', onPress: () => setOrderStatus(order.id, ORDER_STATUS.IN_PROGRESS) });
                  }
                  if (order.status === ORDER_STATUS.IN_PROGRESS) {
                    actions.push({
                      label: isAssignedToMe ? 'Complete' : 'In Progress',
                      onPress: () => setOrderStatus(order.id, ORDER_STATUS.COMPLETED),
                      disabled: !isAssignedToMe,
                    });
                  }

                  return (
                    <View key={order.id}>
                      <OrderCard
                        order={order}
                        recipe={recipe}
                        actions={actions}
                        onShowRecipe={() => setSelectedOrder(order)}
                      />
                      <Text style={[styles.ownershipNotice, inProgressMinutes >= 8 && styles.urgentNotice]}>{ownershipNotice}</Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No active orders. Queue is clear for now.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.queueColumn}>
            <Text style={[styles.sectionTitle, !isWide && styles.completedTitle]}>Completed</Text>
            <View style={styles.sectionCard}>
              {completeOrders.length ? (
                completeOrders.slice(0, 5).map((order) => <OrderCard key={order.id} order={order} recipe={recipes[order.item]} />)
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No completed drinks yet.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <RecipeGuide
        visible={Boolean(selectedOrder)}
        order={selectedOrder}
        recipe={selectedOrder ? recipes[selectedOrder.item] : null}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
    elevation: 4,
  },
  heroEyebrow: {
    color: colors.accentDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.heading,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    marginTop: spacing.xs,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: colors.muted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  welcomeText: {
    marginTop: spacing.sm,
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  heroStatsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroStatPill: {
    flex: 1,
    backgroundColor: colors.panelMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  heroStatLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  heroStatValue: {
    color: colors.accentDark,
    marginTop: 2,
    fontSize: 24,
    fontWeight: '800',
  },
  heroStatSubValue: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  productionStrip: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  productionStripText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: typography.heading,
    marginBottom: spacing.sm,
  },
  completedTitle: {
    marginTop: spacing.lg,
  },
  sectionCard: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 2,
  },
  queueGrid: {
    gap: spacing.md,
  },
  queueGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  queueColumn: {
    flex: 1,
  },
  notice: {
    marginBottom: spacing.md,
    backgroundColor: colors.warning,
    color: colors.white,
    fontWeight: '700',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.sm,
  },
  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.md,
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 20,
  },
  ownershipNotice: {
    marginTop: -4,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    color: colors.muted,
    fontWeight: '600',
  },
  urgentNotice: {
    color: colors.warning,
    fontWeight: '800',
  },
});
