/** @type {import('tailwindcss').Config} */
// Colors are literal values (not CSS variables) so opacity modifiers such as bg-danger/10 are generated.
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#122d45',
        'ink-2': '#334155',
        muted: '#5d6b7c',
        subtle: '#8793a3',
        line: 'rgb(18 45 69 / 0.12)',
        'line-strong': 'rgb(18 45 69 / 0.4)',
        surface: '#f5f6f9',
        accent: '#122d45',
        'accent-hover': '#1061a6',
        success: '#1a8047',
        danger: '#ba2b4c',
        warn: '#9a6200',
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'sans-serif'],
        sans: ['"DM Sans Variable"', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
