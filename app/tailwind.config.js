/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta BSTECH em variaveis (styles.css): tema escuro e claro trocam so os valores.
        bs: {
          bg: 'rgb(var(--bs-bg) / <alpha-value>)',
          surface: 'rgb(var(--bs-surface) / <alpha-value>)',
          panel: 'rgb(var(--bs-panel) / <alpha-value>)',
          'panel-soft': 'rgb(var(--bs-panel-soft) / <alpha-value>)',
          card3: 'rgb(var(--bs-card3) / <alpha-value>)',
          border: 'rgb(var(--bs-border) / <alpha-value>)',
          'border-soft': 'rgb(var(--bs-border-soft) / <alpha-value>)',
          line2: 'rgb(var(--bs-line2) / <alpha-value>)',
          text: 'rgb(var(--bs-text) / <alpha-value>)',
          'text-dim': 'rgb(var(--bs-text-dim) / <alpha-value>)',
          'text-mute': 'rgb(var(--bs-text-mute) / <alpha-value>)',
          accent: 'rgb(var(--bs-accent) / <alpha-value>)',
          'accent-text': 'rgb(var(--bs-accent-text) / <alpha-value>)',
          'accent-soft': 'rgb(var(--bs-accent) / 0.14)',
          'accent-ring': 'rgb(var(--bs-accent) / 0.35)',
          success: 'rgb(var(--bs-success) / <alpha-value>)',
          warning: 'rgb(var(--bs-warning) / <alpha-value>)',
          'warning-text': 'rgb(var(--bs-warning-text) / <alpha-value>)',
          danger: 'rgb(var(--bs-danger) / <alpha-value>)',
          purple: 'rgb(var(--bs-purple) / <alpha-value>)',
          'on-color': 'rgb(var(--bs-on-color) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        shake: 'shake 0.08s ease-in-out infinite',
        pulse_slow: 'pulse_slow 2s ease-in-out infinite',
        live: 'pulse_slow 1s ease-in-out infinite',
        toast: 'toast_in 300ms cubic-bezier(0.23, 1, 0.32, 1)'
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
        },
        toast_in: {
          from: { opacity: 0, transform: 'translate(-50%, -8px)' },
          to: { opacity: 1, transform: 'translate(-50%, 0)' }
        }
      }
    }
  },
  plugins: []
}
