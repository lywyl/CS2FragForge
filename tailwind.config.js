/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html",
  ],
  theme: {
    extend: {
      colors: {
        cs2: {
          deep: '#0A0A0F',
          surface: '#121218',
          elevated: '#1A1A24',
          border: '#23232E',
          gold: '#FBBF24',
          goldDark: '#D97706',
          goldLight: '#FCD34D',
          text: '#F5F5F5',
          textMuted: '#A0A0B0',
        },
      },
    },
  },
  plugins: [],
}

