/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core palette — deep navy + electric teal
        navy: {
          950: '#060b14',
          900: '#0a1120',
          800: '#0f1c35',
          700: '#162847',
          600: '#1e3a5f',
          500: '#284f80',
          400: '#3b6ea5',
        },
        teal: {
          400: '#2dd4bf',
          300: '#5eead4',
          200: '#99f6e4',
          100: '#ccfbf1',
        },
        amber: {
          400: '#fbbf24',
          300: '#fcd34d',
        },
        coral: {
          400: '#fb7185',
          300: '#fda4af',
        },
        // Mastery states
        mastery: {
          untouched: '#334155',
          inProgress: '#d97706',
          mastered: '#0d9488',
          review: '#be185d',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-right': 'slideRight 0.35s ease-out',
        'node-pop': 'nodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight: { from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        nodePop: { from: { transform: 'scale(0.6)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
      },
      backgroundImage: {
        'grid-navy': "linear-gradient(rgba(45,212,191,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.03) 1px, transparent 1px)",
        'glow-teal': 'radial-gradient(ellipse at center, rgba(45,212,191,0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'teal-glow': '0 0 20px rgba(45,212,191,0.2)',
        'teal-glow-lg': '0 0 40px rgba(45,212,191,0.25)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
