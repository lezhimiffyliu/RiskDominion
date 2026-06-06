module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-root': '#0A0A1A',
        'bg-surface': '#1A1A2E',
        'bg-surface-alt': '#222240',
        'bg-ticker': '#0D0D1A',
        'text-primary': '#E0E0E0',
        'text-secondary': '#8899AA',
        'text-accent': '#FFD700',
        'player-1': '#4488FF',
        'player-2': '#FF4444',
        'player-3': '#FFAA00',
        'player-4': '#AA44FF',
        'dim-military': '#FF6666',
        'dim-economic': '#FFCC44',
        'dim-cultural': '#44DDAA',
        'dim-covert': '#AA44FF',
        'highlight': '#FFD700',
        'success': '#44CC66',
        'warning': '#FF8844',
        'neutral': '#2A2A3E',
      },
      fontFamily: {
        ui: ['Orbitron', 'sans-serif'],
        data: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
