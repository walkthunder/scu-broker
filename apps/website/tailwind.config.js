/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0E11',
        panel: '#181A20',
        card: '#1E2329',
        line: '#2B3139',
        paper: '#EAECEF',
        dim: '#B7BDC6',
        mute: '#848E9C',
        gold: '#FCD535',
      },
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 24px rgba(0, 0, 0, 0.28)',
      },
    },
  },
  plugins: [],
};
