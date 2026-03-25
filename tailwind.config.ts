import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#12121a',
          hover: '#1a1a2e',
        },
        border: {
          DEFAULT: '#1e1e2e',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#8888aa',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        success: '#84cc16',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
