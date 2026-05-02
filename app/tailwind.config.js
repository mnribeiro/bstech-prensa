/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta BStech (extraida do simulator HTML)
        bs: {
          bg: '#0a0e14',
          surface: '#0f1419',
          panel: '#161b22',
          border: '#21262d',
          'border-soft': '#1f242c',
          text: '#e6edf3',
          'text-dim': '#8b949e',
          'text-mute': '#6e7681',
          accent: '#58a6ff',
          'accent-soft': 'rgba(88,166,255,0.12)',
          success: '#3fb950',
          warning: '#d29922',
          danger: '#f85149',
          purple: '#a371f7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        shake: 'shake 0.08s ease-in-out infinite',
        pulse_slow: 'pulse_slow 2s ease-in-out infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' }
        },
        shake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(-0.4px, 0.2px)' },
          '75%': { transform: 'translate(0.4px, -0.2px)' }
        },
        pulse_slow: {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 }
        }
      }
    }
  },
  plugins: []
}
