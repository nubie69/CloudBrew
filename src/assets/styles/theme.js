import { Platform } from 'react-native';

export const colors = {
  background: '#f3ecdf',
  panel: '#F5F5DC',
  panelRaised: '#fffdf6',
  panelMuted: '#ede5cf',
  accent: '#6F4E37',
  accentDark: '#5a3f2d',
  accentSoft: '#decdbb',
  text: '#2e2117',
  muted: '#6f5a4b',
  border: '#cdbba7',
  success: '#4CAF50',
  warning: '#9c6a28',
  danger: '#b14a3c',
  white: '#ffffff',
  inkInverse: '#fff7ee',
  backdrop: 'rgba(25, 18, 14, 0.58)',
  shadow: '#23170f',
  heroHighlight: '#eadcc8',
  heroSubtle: '#e8d9c7',
};

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 42,
  xxxl: 54,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
};

export const typography = {
  display: Platform.select({ ios: 'AvenirNext-Bold', android: 'serif', default: 'serif' }),
  heading: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};
