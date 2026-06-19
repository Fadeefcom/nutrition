import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111315',
        ember: '#ff6b4a',
        mint: '#45d09e',
        lagoon: '#4db7d8',
        honey: '#f5c451',
      },
      boxShadow: {
        soft: '0 18px 50px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;

