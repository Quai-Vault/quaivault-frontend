/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        'display': ['Orbitron', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        dark: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        vault: {
          black: '#000000',
          'dark-1': '#0a0a0a',
          'dark-2': '#111111',
          'dark-3': '#1a1a1a',
          'dark-4': '#222222',
          'red-glow': '#ff0000',
          'red-accent': '#dc2626',
          'red-dark': '#991b1b',
          'metallic': '#2a2a2a',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(135deg, #0a0a0a 0%, #1a0505 100%)',
        'gradient-vault': 'linear-gradient(135deg, #000000 0%, #0a0a0a 25%, #1a0505 50%, #0a0a0a 75%, #000000 100%)',
        'gradient-vault-radial': 'radial-gradient(ellipse at center, #1a0505 0%, #000000 100%)',
        'vault-pattern': 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(220, 38, 38, 0.03) 2px, rgba(220, 38, 38, 0.03) 4px)',
      },
      boxShadow: {
        'red-glow': '0 0 20px rgba(220, 38, 38, 0.3), 0 0 40px rgba(220, 38, 38, 0.1)',
        'red-glow-lg': '0 0 40px rgba(220, 38, 38, 0.4), 0 0 80px rgba(220, 38, 38, 0.2)',
        'red-glow-xl': '0 0 60px rgba(220, 38, 38, 0.5), 0 0 120px rgba(220, 38, 38, 0.3)',
        'yellow-glow-lg': '0 0 40px rgba(234, 179, 8, 0.4), 0 0 80px rgba(234, 179, 8, 0.2)',
        'vault-inner': 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(220, 38, 38, 0.1)',
        'vault-outer': '0 4px 6px rgba(0, 0, 0, 0.7), 0 10px 15px rgba(0, 0, 0, 0.5), 0 0 20px rgba(220, 38, 38, 0.2)',
        'vault-card': '0 8px 16px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(220, 38, 38, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'vault-button': '0 4px 8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(220, 38, 38, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'vault-button-hover': '0 6px 12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'glow-slow': 'glow-slow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'scan': 'scan 3s linear infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', filter: 'brightness(1)' },
          '50%': { opacity: '1', filter: 'brightness(1.2)' },
        },
        'glow-slow': {
          '0%, 100%': { opacity: '0.3', filter: 'brightness(0.8)' },
          '50%': { opacity: '0.6', filter: 'brightness(1.1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
