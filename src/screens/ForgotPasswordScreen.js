import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { useUser } from '../context/UserContext';

const SUCCESS_BUBBLE_MESSAGE = 'It already sent into your email, please check it';
const FAILURE_BUBBLE_MESSAGE = 'Email is not existed';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { requestAdminResetCode } = useUser();
  const [email, setEmail] = useState('admin@cloudbrew.app');
  const [bubbleMessage, setBubbleMessage] = useState('');
  const [inlineError, setInlineError] = useState('');
  const [loading, setLoading] = useState(false);

  const showBubble = (message, tone = 'neutral') => {
    setBubbleMessage(message);
    setTimeout(() => {
      setBubbleMessage('');
    }, 2800);
  };

  const submitRequest = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setInlineError(FAILURE_BUBBLE_MESSAGE);
      return;
    }

    try {
      setLoading(true);
      setInlineError('');
      const response = await requestAdminResetCode(normalizedEmail);

      if (String(response?.message || '').toLowerCase() === 'reset link sent') {
        showBubble(SUCCESS_BUBBLE_MESSAGE, 'success');
      } else if (String(response?.message || '').toLowerCase() === FAILURE_BUBBLE_MESSAGE.toLowerCase()) {
        setInlineError(FAILURE_BUBBLE_MESSAGE);
      }
    } catch (error) {
      const message = String(error?.message || '').toLowerCase().includes('email is not existed')
        ? FAILURE_BUBBLE_MESSAGE
        : error.message || FAILURE_BUBBLE_MESSAGE;
      setInlineError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <View style={styles.ambientTop} />
      <View style={styles.ambientBottom} />

      {bubbleMessage ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toastBubbleSuccess}>
            <Text style={styles.toastText}>{bubbleMessage}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.eyebrow}>Cloud Brew Security</Text>
        <Text style={styles.title}>Admin Password Recovery</Text>
        <Text style={styles.subtitle}>Use this secure flow to reset admin access. Enter either your admin sign-in email or recovery email.</Text>

        <View style={styles.infoPanel}>
          <Text style={styles.infoPanelTitle}>What Happens Next</Text>
          <Text style={styles.infoPanelLine}>1. We validate the admin account.</Text>
          <Text style={styles.infoPanelLine}>2. A secure reset link is sent to the configured recovery inbox.</Text>
          <Text style={styles.infoPanelLine}>3. The reset link expires after 15 minutes.</Text>
        </View>

        <Text style={styles.label}>Admin Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Input your Email"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        {inlineError ? <Text style={styles.inlineErrorText}>{inlineError}</Text> : null}

        <Pressable style={[styles.primaryButton, loading && styles.disabledButton]} onPress={submitRequest} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.inkInverse} /> : <Text style={styles.primaryButtonText}>Send Secure Reset Link</Text>}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('LoginScreen')}>
          <Text style={styles.secondaryButtonText}>Back to Login</Text>
        </Pressable>
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
  ambientTop: {
    position: 'absolute',
    top: -110,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.heroHighlight,
    opacity: 0.9,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.heroSubtle,
    opacity: 0.85,
  },
  toastWrap: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
  },
  toastBubble: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
    maxWidth: 760,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  toastBubbleSuccess: {
    borderColor: 'rgba(76, 175, 80, 0.38)',
    backgroundColor: '#e7f4e9',
  },
  toastText: {
    color: colors.text,
    fontFamily: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
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
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 20,
    elevation: 6,
  },
  eyebrow: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  infoPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  infoPanelTitle: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  infoPanelLine: {
    color: colors.text,
    lineHeight: 20,
    marginBottom: 2,
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
  inlineErrorText: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    color: colors.danger,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
});
