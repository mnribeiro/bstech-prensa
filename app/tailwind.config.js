/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta BStech (alinhada com o webapp em ../bstech-sistema)
        bs: {
          bg: '#141414',          // background (hsl 0 0% 8%)
          surface: '#0d0d0d',     // sidebar (hsl 0 0% 5%)
          panel: '#1c1c1c',       // card (hsl 0 0% 11%)
          'panel-soft': '#212121',
          border: '#262626',      // border (hsl 0 0% 15%)
          'border-soft': '#1f1f1f',
          text: '#f2f2f2',        // foreground (hsl 0 0% 95%)
          'text-dim': '#adadad',  // muted-foreground (hsl 0 0% 68%)
          'text-mute': '#737373',
          accent: '#3b82f6',      // primary (hsl 217 91% 60%)
          'accent-soft': 'rgba(59,130,246,0.14)',
          'accent-ring': 'rgba(59,130,246,0.35)',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
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
