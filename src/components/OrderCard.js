import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import StatusBadge from './StatusBadge';
import { ORDER_STATUS } from '../utils/helpers';

const STATUS_BORDER = {
  [ORDER_STATUS.PENDING]: colors.warning,
  [ORDER_STATUS.IN_PROGRESS]: colors.accent,
  [ORDER_STATUS.COMPLETED]: colors.success,
};

export default function OrderCard({ order, recipe, actions = [], onShowRecipe }) {
  const addOnCount = order.addons?.length || 0;

  return (
    <View style={[styles.card, { borderLeftColor: STATUS_BORDER[order.status] || colors.border }]}> 
      <View style={styles.headerRow}>
        <Text style={styles.orderId}>{order.id}</Text>
        <StatusBadge status={order.status} />
      </View>

      <Text style={styles.drinkLabel}>
        {order.quantity || 1} x {order.item} · {order.size}
      </Text>

      <View style={styles.metaChipRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Qty {order.quantity || 1}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{addOnCount ? `${addOnCount} Add-ons` : 'No Add-ons'}</Text>
        </View>
      </View>

      <Text style={styles.meta}>Add-ons: {order.addons?.length ? order.addons.join(', ') : 'None'}</Text>
      <Text style={styles.meta}>Cashier: {order.createdBy}</Text>
      <Text style={styles.meta}>Assigned: {order.handledBy || 'Unassigned'}</Text>

      {recipe ? (
        <View style={styles.recipePreview}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {recipe.ingredients.map((ingredient) => (
            <Text key={ingredient} style={styles.recipeText}>
              • {ingredient}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {onShowRecipe ? (
          <Pressable style={styles.recipeButton} onPress={onShowRecipe}>
            <Text style={styles.recipeButtonText}>Guide Steps</Text>
          </Pressable>
        ) : null}

        {actions.map((action) => (
          <Pressable key={action.label} style={[styles.actionButton, action.disabled && styles.actionButtonDisabled]} onPress={action.onPress} disabled={action.disabled}>
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: {
    color: colors.accentDark,
    fontWeight: '700',
    fontFamily: typography.mono,
    backgroundColor: colors.panelMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  drinkLabel: {
    color: colors.text,
    fontSize: 19,
    fontFamily: typography.heading,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  metaChipRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  metaChipText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 12,
  },
  recipePreview: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
  },
  sectionTitle: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
    marginBottom: 4,
  },
  recipeText: {
    color: colors.text,
    marginTop: 2,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  actionButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 34,
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionText: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '600',
  },
  recipeButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 34,
    justifyContent: 'center',
  },
  recipeButtonText: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '600',
  },
});
