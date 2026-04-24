import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../assets/styles/theme';
import { useUser } from '../context/UserContext';
import AdminScreen from '../screens/AdminScreen';
import BaristaScreen from '../screens/BaristaScreen';
import CashierScreen from '../screens/CashierScreen';
import LoginScreen from '../screens/LoginScreen';

const Stack = createNativeStackNavigator();

function LogoutButton({ onPress }) {
  return (
    <Pressable style={styles.logoutButton} onPress={onPress}>
      <Text style={styles.logoutButtonText}>Logout</Text>
    </Pressable>
  );
}

function StatusScreen({ title, subtitle, loading }) {
  return (
    <View style={styles.statusScreen}>
      <View style={styles.statusGlowTop} />
      <View style={styles.statusGlowBottom} />

      <View style={styles.statusCard}>
      {loading ? <ActivityIndicator size="large" color={colors.accent} /> : null}
      <Text style={[styles.statusTitle, { marginTop: loading ? 16 : 0 }]}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.statusSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function RoleGate({ currentUser, allowedRoles, children }) {
  if (!currentUser) {
    return <StatusScreen title="Please sign in" subtitle="Login is required to access this section." loading={false} />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return <StatusScreen title="Access restricted" subtitle="Your account role cannot access this screen." loading={false} />;
  }

  return children;
}

export default function AppNavigator() {
  const { currentUser, logout, ready, bootError } = useUser();

  if (!ready) {
    return <StatusScreen title="Connecting to backend..." subtitle="Loading app data" loading />;
  }

  if (bootError) {
    return <StatusScreen title="Cannot reach API server" subtitle={bootError} loading={false} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="LoginScreen"
        screenOptions={{
          headerStyle: { backgroundColor: colors.panelRaised },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontFamily: typography.heading,
            fontWeight: '800',
            fontSize: 19,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="LoginScreen" component={LoginScreen} options={{ headerShown: false }} />

        <Stack.Screen
          name="CashierScreen"
          options={{
            title: 'Cashier POS',
            headerRight: () => <LogoutButton onPress={logout} />,
          }}
        >
          {() => (
            <RoleGate currentUser={currentUser} allowedRoles={['cashier', 'admin']}>
              <CashierScreen />
            </RoleGate>
          )}
        </Stack.Screen>

        <Stack.Screen
          name="BaristaScreen"
          options={{
            title: 'Barista Board',
            headerRight: () => <LogoutButton onPress={logout} />,
          }}
        >
          {() => (
            <RoleGate currentUser={currentUser} allowedRoles={['barista', 'admin']}>
              <BaristaScreen />
            </RoleGate>
          )}
        </Stack.Screen>

        <Stack.Screen
          name="AdminScreen"
          options={{
            title: 'Admin Control',
            headerRight: () => <LogoutButton onPress={logout} />,
          }}
        >
          {() => (
            <RoleGate currentUser={currentUser} allowedRoles={['admin']}>
              <AdminScreen />
            </RoleGate>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  logoutButtonText: {
    color: colors.accentDark,
    fontFamily: typography.heading,
    fontWeight: '700',
  },
  statusScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  statusGlowTop: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -90,
    left: -60,
    backgroundColor: colors.accentSoft,
    opacity: 0.95,
  },
  statusGlowBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -70,
    bottom: -110,
    backgroundColor: colors.panelMuted,
    opacity: 0.9,
  },
  statusCard: {
    width: '100%',
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 18,
    elevation: 6,
  },
  statusTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusSubtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
