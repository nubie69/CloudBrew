import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import OrderCard from '../components/OrderCard';
import { useUser } from '../context/UserContext';
import { ADD_ON_OPTIONS, DRINK_OPTIONS, SIZE_OPTIONS } from '../utils/helpers';

function formatOrderLine(item) {
  const addonsLabel = item.addons.length ? item.addons.join(', ') : 'None';
  return `${item.quantity} x ${item.item} (${item.size}) + ${addonsLabel}`;
}

function DrinkCard({ label, imageUri, active, onPress }) {
  return (
    <Pressable style={[styles.drinkCard, active && styles.drinkCardActive]} onPress={onPress}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.drinkImage} resizeMode="cover" />
      ) : (
        <View style={styles.drinkImagePlaceholder}>
          <Text style={styles.drinkImagePlaceholderText}>No Image</Text>
        </View>
      )}
      <Text style={[styles.drinkCardLabel, active && styles.drinkCardLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ChoicePill({ label, active, onPress }) {
  return (
    <Pressable style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function QuantitySelector({ value, onIncrease, onDecrease }) {
  return (
    <View style={styles.quantityRow}>
      <Pressable style={styles.qtyButton} onPress={onDecrease}>
        <Text style={styles.qtyButtonText}>-</Text>
      </Pressable>
      <View style={styles.qtyValueWrap}>
        <Text style={styles.qtyValueText}>{value}</Text>
      </View>
      <Pressable style={styles.qtyButton} onPress={onIncrease}>
        <Text style={styles.qtyButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

export default function CashierScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1080;
  const { orders, placeOrder, recipes } = useUser();
  const drinkOptions = useMemo(() => {
    const recipeDrinks = Object.keys(recipes || {}).sort((a, b) => a.localeCompare(b));
    return recipeDrinks.length ? recipeDrinks : DRINK_OPTIONS;
  }, [recipes]);
  const drinkCards = useMemo(
    () => drinkOptions.map((name) => ({ name, imageUrl: recipes?.[name]?.imageUrl || '' })),
    [drinkOptions, recipes]
  );
  const [item, setItem] = useState(DRINK_OPTIONS[0]);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(SIZE_OPTIONS[1]);
  const [addons, setAddons] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [editingItemId, setEditingItemId] = useState('');
  const [submittingQueue, setSubmittingQueue] = useState(false);
  const [showDrinkDropdown, setShowDrinkDropdown] = useState(false);

  useEffect(() => {
    if (!drinkOptions.includes(item)) {
      setItem(drinkOptions[0]);
    }
  }, [drinkOptions, item]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [orders]
  );

  const liveQueueQuantity = useMemo(
    () => sortedOrders.reduce((sum, order) => sum + (order.quantity || 1), 0),
    [sortedOrders]
  );

  const totalQueuedQuantity = useMemo(
    () => orderItems.reduce((sum, orderItem) => sum + orderItem.quantity, 0),
    [orderItems]
  );

  const toggleAddon = (addon) => {
    setAddons((prev) => (prev.includes(addon) ? prev.filter((itemValue) => itemValue !== addon) : [...prev, addon]));
  };

  const startEditItem = (orderItem) => {
    setEditingItemId(orderItem.id);
    setItem(orderItem.item);
    setQuantity(orderItem.quantity);
    setSize(orderItem.size);
    setAddons(orderItem.addons);
  };

  const cancelEditing = () => {
    setEditingItemId('');
    setQuantity(1);
    setSize(SIZE_OPTIONS[1]);
    setAddons([]);
  };

  const addOrUpdateOrderItem = () => {
    const normalizedQuantity = Math.max(1, Number(quantity) || 1);
    const nextItem = {
      id: editingItemId || `line-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      item,
      quantity: normalizedQuantity,
      size,
      addons,
    };

    if (editingItemId) {
      setOrderItems((prev) => prev.map((orderItem) => (orderItem.id === editingItemId ? nextItem : orderItem)));
      cancelEditing();
      return;
    }

    setOrderItems((prev) => [...prev, nextItem]);
    setQuantity(1);
    setAddons([]);
  };

  const removeOrderItem = (itemId) => {
    setOrderItems((prev) => prev.filter((orderItem) => orderItem.id !== itemId));
    if (editingItemId === itemId) {
      cancelEditing();
    }
  };

  const submitQueue = async () => {
    try {
      setSubmittingQueue(true);
      let sentCount = 0;

      for (const orderItem of orderItems) {
        await placeOrder({
          item: orderItem.item,
          quantity: orderItem.quantity,
          size: orderItem.size,
          addons: orderItem.addons,
        });
        sentCount += orderItem.quantity;
      }

      setOrderItems([]);
      cancelEditing();
      Alert.alert('Order queued', `${sentCount} item(s) marked Pending / In Queue.`);
    } catch (error) {
      Alert.alert('Unable to send queue', error.message);
    } finally {
      setSubmittingQueue(false);
    }
  };

  const onProceedToQueue = () => {
    if (!orderItems.length) {
      Alert.alert('No items yet', 'Add at least one item before sending to queue.');
      return;
    }

    const summary = orderItems.map((orderItem, index) => `${index + 1}. ${formatOrderLine(orderItem)}`).join('\n');
    const finalMessage = `${summary}\n\nTotal quantity: ${totalQueuedQuantity}\nStatus: Pending / In Queue`;

    Alert.alert('Confirm final order', finalMessage, [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Confirm & Send',
        onPress: submitQueue,
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Cashier Station</Text>
        <Text style={styles.heroTitle}>Build Orders Fast</Text>
        <Text style={styles.heroSubtitle}>Configure drinks and send them straight to the barista board.</Text>

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatPill}>
            <Text style={styles.heroStatLabel}>Queue</Text>
            <Text style={styles.heroStatValue}>{sortedOrders.length}</Text>
          </View>
          <View style={styles.heroStatPill}>
            <Text style={styles.heroStatLabel}>Selection</Text>
            <Text style={styles.heroStatValueSmall}>
              {quantity}x {item} {size}
            </Text>
          </View>
          <View style={styles.heroStatPill}>
            <Text style={styles.heroStatLabel}>Drinks In Queue</Text>
            <Text style={styles.heroStatValue}>{liveQueueQuantity}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.workbenchGrid, isWide && styles.workbenchGridWide]}>
        <View style={styles.workbenchColumn}>
          <Text style={styles.sectionTitle}>Order Builder</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.fieldLabel}>Drink (Dropdown)</Text>
            <Pressable style={styles.dropdownTrigger} onPress={() => setShowDrinkDropdown((prev) => !prev)}>
              <Text style={styles.dropdownTriggerText}>{item}</Text>
              <Text style={styles.dropdownChevron}>{showDrinkDropdown ? '▲' : '▼'}</Text>
            </Pressable>

            {showDrinkDropdown ? (
              <View style={styles.dropdownMenu}>
                {drinkOptions.map((drinkOption) => (
                  <Pressable
                    key={drinkOption}
                    style={[styles.dropdownItem, item === drinkOption && styles.dropdownItemActive]}
                    onPress={() => {
                      setItem(drinkOption);
                      setShowDrinkDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, item === drinkOption && styles.dropdownItemTextActive]}>{drinkOption}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Quick Drink Cards</Text>
            <View style={styles.drinkGrid}>
              {drinkCards.map((drink) => (
                <DrinkCard
                  key={drink.name}
                  label={drink.name}
                  imageUri={drink.imageUrl}
                  active={item === drink.name}
                  onPress={() => setItem(drink.name)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Quantity</Text>
            <QuantitySelector
              value={quantity}
              onIncrease={() => setQuantity((prev) => Math.min(20, prev + 1))}
              onDecrease={() => setQuantity((prev) => Math.max(1, prev - 1))}
            />

            <Text style={styles.fieldLabel}>Size</Text>
            <View style={styles.optionWrap}>
              {SIZE_OPTIONS.map((option) => (
                <ChoicePill key={option} label={option} active={size === option} onPress={() => setSize(option)} />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Add-ons</Text>
            <View style={styles.optionWrap}>
              {ADD_ON_OPTIONS.map((option) => (
                <ChoicePill
                  key={option}
                  label={option}
                  active={addons.includes(option)}
                  onPress={() => toggleAddon(option)}
                />
              ))}
            </View>

            <Pressable style={styles.proceedButton} onPress={addOrUpdateOrderItem}>
              <Text style={styles.proceedText}>{editingItemId ? 'Save Item Changes' : 'Add Item To Order'}</Text>
            </Pressable>

            {editingItemId ? (
              <Pressable style={styles.secondaryButton} onPress={cancelEditing}>
                <Text style={styles.secondaryButtonText}>Cancel Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.workbenchColumn}>
          <View style={styles.queueHeader}>
            <Text style={styles.sectionTitle}>Order Summary Panel</Text>
            <Text style={styles.queueCount}>{orderItems.length} lines</Text>
          </View>

          <View style={styles.sectionCard}>
            {orderItems.length ? (
              <>
                {orderItems.map((orderItem) => (
                  <View key={orderItem.id} style={styles.summaryRowCard}>
                    <Text style={styles.summaryLineText}>{formatOrderLine(orderItem)}</Text>
                    <View style={styles.summaryActionRow}>
                      <Pressable style={styles.summaryEditButton} onPress={() => startEditItem(orderItem)}>
                        <Text style={styles.summaryActionText}>Edit</Text>
                      </Pressable>
                      <Pressable style={styles.summaryRemoveButton} onPress={() => removeOrderItem(orderItem.id)}>
                        <Text style={styles.summaryActionText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                <View style={styles.summaryTotalsWrap}>
                  <Text style={styles.summaryTotalsText}>Total quantity: {totalQueuedQuantity}</Text>
                  <Text style={styles.summaryTotalsHint}>Total price: N/A</Text>
                </View>

                <Pressable style={[styles.proceedButton, submittingQueue && styles.disabledButton]} onPress={onProceedToQueue} disabled={submittingQueue}>
                  <Text style={styles.proceedText}>{submittingQueue ? 'Sending...' : 'Proceed / Send To Queue'}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No items in this order yet. Add one from the builder above.</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.queueHeader}>
        <Text style={styles.sectionTitle}>Live Queue Board</Text>
        <Text style={styles.queueCount}>{sortedOrders.length} orders</Text>
      </View>

      <View style={styles.sectionCard}>
        {sortedOrders.length ? (
          sortedOrders.map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Queue is empty right now.</Text>
          </View>
        )}
      </View>
    </ScrollView>
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
    backgroundColor: colors.accentDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
    elevation: 4,
  },
  heroEyebrow: {
    color: colors.heroHighlight,
    fontFamily: typography.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: colors.inkInverse,
    fontFamily: typography.display,
    fontSize: 30,
    marginTop: spacing.xs,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    color: colors.heroSubtle,
    lineHeight: 20,
  },
  heroStatsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroStatPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  heroStatLabel: {
    color: colors.heroSubtle,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  heroStatValue: {
    color: colors.white,
    marginTop: 2,
    fontSize: 24,
    fontWeight: '800',
  },
  heroStatValueSmall: {
    color: colors.white,
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: typography.heading,
    fontWeight: '800',
    marginBottom: spacing.sm,
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
  workbenchGrid: {
    gap: spacing.md,
  },
  workbenchGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  workbenchColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  dropdownTrigger: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dropdownTriggerText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  dropdownChevron: {
    color: colors.accentDark,
    fontWeight: '800',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  dropdownItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.panelRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: colors.panelMuted,
  },
  dropdownItemText: {
    color: colors.text,
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  qtyValueWrap: {
    minWidth: 70,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
  },
  qtyValueText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 18,
  },
  drinkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  drinkCard: {
    width: 122,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  drinkCardActive: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  drinkImage: {
    width: '100%',
    height: 74,
    backgroundColor: colors.panelMuted,
  },
  drinkImagePlaceholder: {
    width: '100%',
    height: 74,
    backgroundColor: colors.panelMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drinkImagePlaceholderText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  drinkCardLabel: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
  drinkCardLabelActive: {
    color: colors.accentDark,
  },
  pill: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.white,
  },
  proceedButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  proceedText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.panel,
  },
  secondaryButtonText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  summaryRowCard: {
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.sm,
  },
  summaryLineText: {
    color: colors.text,
    lineHeight: 20,
    fontWeight: '600',
  },
  summaryActionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  summaryEditButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    alignItems: 'center',
  },
  summaryRemoveButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.danger,
    paddingVertical: 8,
    alignItems: 'center',
  },
  summaryActionText: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  summaryTotalsWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryTotalsText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  summaryTotalsHint: {
    color: colors.muted,
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.6,
  },
  queueHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queueCount: {
    color: colors.muted,
    fontWeight: '700',
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
});
