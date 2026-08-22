import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'placeholder.svg'],
      manifest: {
        name: 'PharmTrack Zim',
        short_name: 'PharmTrack',
        description: "Zimbabwe's Real-time Medicine Network",
        theme_color: '#007A6E',
        icons: [
          {
            src: 'placeholder.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'placeholder.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-core': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          'vendor-ui': ['lucide-react', 'sonner', 'clsx', 'tailwind-merge'],
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-slot',
            '@radix-ui/react-label'
          ],
          'vendor-charts': ['recharts'],
          'vendor-maps': ['@react-google-maps/api'],
          'vendor-excel': ['xlsx'],
          'vendor-form': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-utils': ['axios', 'date-fns', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
