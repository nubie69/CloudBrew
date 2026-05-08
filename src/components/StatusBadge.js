import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { ORDER_STATUS } from '../utils/helpers';

const STATUS_COLORS = {
  [ORDER_STATUS.PENDING]: colors.warning,
  [ORDER_STATUS.IN_PROGRESS]: colors.accent,
  [ORDER_STATUS.COMPLETED]: colors.success,
};

export default function StatusBadge({ status }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[status] || colors.muted }]}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignSelf: 'flex-start',
    minWidth: 104,
    alignItems: 'center',
  },
  text: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '700',
    textTransform: 'capitalize',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
