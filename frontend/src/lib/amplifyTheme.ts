import { defaultDarkModeOverride, type Theme } from '@aws-amplify/ui-react';

export const amplifyTheme: Theme = {
  name: 'todo-app-theme',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: '#eef2ff' },
          20: { value: '#e0e7ff' },
          40: { value: '#a5b4fc' },
          80: { value: '#4f46e5' },
          90: { value: '#4338ca' },
          100: { value: '#3730a3' },
        },
      },
      // Amplify's built-in components (e.g. the Authenticator's primary button)
      // read `colors.primary`, not `colors.brand.primary` — alias it so our
      // brand color actually reaches those components.
      primary: {
        10: { value: '{colors.brand.primary.10}' },
        20: { value: '{colors.brand.primary.20}' },
        40: { value: '{colors.brand.primary.40}' },
        80: { value: '{colors.brand.primary.80}' },
        90: { value: '{colors.brand.primary.90}' },
        100: { value: '{colors.brand.primary.100}' },
      },
    },
  },
  overrides: [defaultDarkModeOverride],
};
