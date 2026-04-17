// src/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'atc-blue': '#58A6FF',
        'atc-purple': '#BC85FF',
        'github-dark': '#0d1117',
        'github-border': '#30363d',
        'radar-active': 'var(--color-radar-active, #22c55e)',
        'radar-wait': 'var(--color-radar-wait, #eab308)',
        'radar-yield': 'var(--color-radar-yield, #ef4444)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      zIndex: {
        'hud': '10',         // Heads Up Display (Radar, background info)
        'panel': '40',       // Floating Panels (Queue, Tactical, Terminal)
        'sidebar': '50',     // Main Navigation Sidebar
        'modal': '60',       // Modal Dialogs
        'tooltip': '70',     // Tooltips
        'toast': '100',      // Notifications
      }
    },
  },
  plugins: [],
};