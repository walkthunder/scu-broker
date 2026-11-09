/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        // 机构刊：暖纸底、白卡片、铜橙只做强调。面向政府、央国企、金融机构。
        ink: '#F6F3EE',
        paper: '#1C1917',
        panel: '#FFFCF8',
        card: '#FFFFFF',
        line: '#E6E0D6',
        dim: '#5C564E',
        mute: '#8A8175',
        gold: '#C2410C',
        flare: '#E07A2F',
        rise: '#A33B32',
        fall: '#2F6B4F',
        live: '#3D6B64',
      },
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.05)',
      },
    },
  },
  plugins: [],
};
