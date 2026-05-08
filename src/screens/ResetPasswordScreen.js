import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { useUser } from '../context/UserContext';

export default function ResetPasswordScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { resetAdminAccountPassword } = useUser();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tokenFromRoute = String(route?.params?.token || '').trim();
    if (tokenFromRoute) {
      setToken(tokenFromRoute);
    }
  }, [route?.params?.token]);

  const submitReset = async () => {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setStatusMessage('Reset token is required.');
      return;
    }

    if (newPassword.trim().length < 8) {
      setStatusMessage('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage('Password confirmation does not match.');
      return;
    }

    try {
      setLoading(true);
      setStatusMessage('');
      await resetAdminAccountPassword(normalizedToken, newPassword.trim());
      setStatusMessage('Password reset successful. You can now sign in as admin.');
      setNewPassword('');
      setConfirmPassword('');
      setToken('');
    } catch (error) {
      setStatusMessage(error.message || 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <View style={styles.card}>
        <Text style={styles.title}>Set New Admin Password</Text>
        <Text style={styles.subtitle}>Open this screen from your recovery link, then enter your new admin password.</Text>

        <Text style={styles.label}>Reset Token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Paste token from link"
          autoCapitalize="none"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>New Password</Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Enter new password"
          secureTextEntry
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          secureTextEntry
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Pressable style={[styles.primaryButton, loading && styles.disabledButton]} onPress={submitReset} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.inkInverse} /> : <Text style={styles.primaryButtonText}>Reset Password</Text>}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('LoginScreen')}>
          <Text style={styles.secondaryButtonText}>Back to Login</Text>
        </Pressable>

        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
    padding: spacing.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  label: {
    color: colors.text,
    fontFamily: typography.heading,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  primaryButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    color: colors.inkInverse,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.panel,
  },
  secondaryButtonText: {
    color: colors.text,
    fontFamily: typography.heading,
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusText: {
    marginTop: spacing.md,
    color: colors.muted,
    lineHeight: 22,
  },
});
