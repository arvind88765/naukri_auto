import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4A90D9',
        success: '#06d6a0',
        warning: '#f0a500',
        danger: '#e74c3c',
      },
    },
  },
  plugins: [],
}

export default config
