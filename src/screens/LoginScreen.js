import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { useUser } from '../context/UserContext';

const ROLES = [
  { label: 'Cashier', value: 'cashier', icon: 'cart-outline' },
  { label: 'Barista', value: 'barista', icon: 'cafe-outline' },
  { label: 'Admin', value: 'admin', icon: 'shield-checkmark-outline' },
];

const DEFAULT_EMAIL_BY_ROLE = {
  cashier: 'cashier@cloudbrew.app',
  barista: 'barista@cloudbrew.app',
  admin: 'admin@cloudbrew.app',
};

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useUser();
  const [selectedRole, setSelectedRole] = useState('cashier');
  const [email, setEmail] = useState(DEFAULT_EMAIL_BY_ROLE.cashier);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardLift = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 460, useNativeDriver: true }),
      Animated.spring(cardLift, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, [cardLift, cardOpacity]);

  const onRoleSelect = (role) => {
    setSelectedRole(role);
    setEmail(DEFAULT_EMAIL_BY_ROLE[role] || '');
    setError('');
  };

  const onLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const user = await login(selectedRole, email.trim().toLowerCase(), password.trim());
      if (user?.role === 'cashier') {
        navigation.replace('CashierScreen');
      }
      if (user?.role === 'barista') {
        navigation.replace('BaristaScreen');
      }
      if (user?.role === 'admin') {
        navigation.replace('AdminScreen');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <View style={styles.ambientTop} />
      <View style={styles.ambientBottom} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardLift }],
            },
          ]}
        >
          <Text style={styles.eyebrow}>Cloud Brew Access</Text>
          <Text style={styles.title}>Brewline Control</Text>
          <Text style={styles.subtitle}>Sign in with role, email, and password to enter your workstation.</Text>

          <View style={styles.roleRow}>
            {ROLES.map((role) => {
              const active = role.value === selectedRole;
              return (
                <Pressable key={role.value} style={[styles.roleButton, active && styles.activeRoleButton]} onPress={() => onRoleSelect(role.value)}>
                  <View style={styles.roleButtonInner}>
                    <Ionicons name={role.icon} size={18} color={active ? colors.inkInverse : colors.accentDark} />
                    <Text style={[styles.roleText, active && styles.activeRoleText]}>{role.label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Input your Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable style={[styles.loginButton, loading && styles.disabledButton]} onPress={onLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.inkInverse} /> : <Text style={styles.loginText}>Enter Operations</Text>}
          </Pressable>

          {selectedRole === 'admin' ? (
            <Pressable style={styles.linkButton} onPress={() => navigation.navigate('ForgotPasswordScreen')}>
              <Text style={styles.linkButtonText}>Forgot Admin Password?</Text>
            </Pressable>
          ) : null}

          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>Starter Accounts</Text>
            <Text style={styles.hintLine}>Admin: admin@cloudbrew.app</Text>
            <Text style={styles.hintLine}>Cashier: cashier@cloudbrew.app</Text>
            <Text style={styles.hintLine}>Barista: barista@cloudbrew.app</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  ambientTop: {
    position: 'absolute',
    top: -120,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.heroHighlight,
    opacity: 0.95,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -130,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.heroSubtle,
    opacity: 0.92,
  },
  card: {
    backgroundColor: colors.panelRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 24,
    elevation: 6,
  },
  eyebrow: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    fontSize: 40,
    color: colors.text,
    fontFamily: typography.display,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  roleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panel,
    minWidth: 102,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  roleButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  activeRoleButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  roleText: {
    color: colors.text,
    fontWeight: '700',
    fontFamily: typography.heading,
  },
  activeRoleText: {
    color: colors.inkInverse,
  },
  fieldLabel: {
    color: colors.muted,
    marginBottom: spacing.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorText: {
    marginTop: spacing.xxs,
    color: colors.danger,
    fontWeight: '600',
  },
  loginButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    minHeight: 50,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginText: {
    color: colors.inkInverse,
    fontFamily: typography.heading,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  linkButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  linkButtonText: {
    color: colors.accentDark,
    fontWeight: '700',
  },
  resetPanel: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.panelMuted,
  },
  resetTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  resetHint: {
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  hintBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.panelMuted,
  },
  hintTitle: {
    color: colors.accentDark,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  hintLine: {
    color: colors.muted,
    fontFamily: typography.mono,
  },
});