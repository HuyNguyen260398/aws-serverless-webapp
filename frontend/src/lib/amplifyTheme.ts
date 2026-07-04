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
    },
  },
  overrides: [defaultDarkModeOverride],
};
