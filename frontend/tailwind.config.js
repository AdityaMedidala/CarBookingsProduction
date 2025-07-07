/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'switch-red': '#e60012',
        'joycon-blue': '#00b0f0',
        'joycon-neon-green': '#7cfc00',
        'dark-ui': '#444444',
        'light-ui': '#f5f5f5',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      fontFamily: {
        'sans': ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
}