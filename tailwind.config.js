/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1B2A4A', light: '#243656', dark: '#121D33', 50: '#E8EDF5', 100: '#C5D0E5', 200: '#8FA3C5', 300: '#5A76A5', 400: '#3A5280', 500: '#1B2A4A', 600: '#162240', 700: '#111A33', 800: '#0C1226', 900: '#070A19' },
        gold: { DEFAULT: '#D4A843', light: '#E4C373', dark: '#B08A2E', 50: '#FBF5E6', 100: '#F5E6BF', 200: '#EDD48F', 300: '#E4C373', 400: '#D4A843', 500: '#B08A2E', 600: '#8C6E24', 700: '#68521B', 800: '#443611', 900: '#201A08' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
