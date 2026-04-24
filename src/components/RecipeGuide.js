import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';

export default function RecipeGuide({ visible, order, recipe, onClose }) {
  const [ingredientsExpanded, setIngredientsExpanded] = React.useState(true);
  const [stepsExpanded, setStepsExpanded] = React.useState(true);

  React.useEffect(() => {
    if (visible) {
      setIngredientsExpanded(true);
      setStepsExpanded(true);
    }
  }, [visible, order?.id]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Preparation Guide</Text>
          {order ? <Text style={styles.subtitle}>{order.item}</Text> : null}

          <ScrollView style={styles.scrollArea}>
            <Pressable style={styles.sectionRow} onPress={() => setIngredientsExpanded((prev) => !prev)}>
              <Text style={styles.section}>Ingredients</Text>
              <Text style={styles.sectionToggle}>{ingredientsExpanded ? 'Hide' : 'Show'}</Text>
            </Pressable>
            {ingredientsExpanded
              ? recipe?.ingredients?.map((item) => (
                  <Text key={item} style={styles.itemText}>
                    • {item}
                  </Text>
                ))
              : null}

            <Pressable style={[styles.sectionRow, styles.sectionGap]} onPress={() => setStepsExpanded((prev) => !prev)}>
              <Text style={styles.section}>Steps</Text>
              <Text style={styles.sectionToggle}>{stepsExpanded ? 'Hide' : 'Show'}</Text>
            </Pressable>
            {stepsExpanded
              ? recipe?.steps?.map((step, index) => (
                  <Text key={`${step}-${index}`} style={styles.itemText}>
                    {index + 1}. {step}
                  </Text>
                ))
              : null}
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    padding: spacing.md,
  },
  panel: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    maxHeight: '75%',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontFamily: typography.display,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.accentDark,
    marginTop: 4,
    fontFamily: typography.heading,
    fontWeight: '600',
  },
  scrollArea: {
    marginTop: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  section: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionToggle: {
    color: colors.accent,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 12,
  },
  sectionGap: {
    marginTop: spacing.md,
  },
  itemText: {
    color: colors.text,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  closeButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDark,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: {
    color: colors.white,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
});
