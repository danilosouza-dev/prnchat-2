import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
          dest: '.'
        },
        {
          src: 'public/icons/*',
          dest: 'icons'
        },
        {
          src: 'public/wppconnect-wa.js',
          dest: '.'
        },
        {
          src: 'public/logo.png',
          dest: '.'
        },
        {
          src: 'src/content/whatsapp-ui-overlay.css',
          dest: 'content'
        },
        {
          src: 'src/content/whatsapp-fab.css',
          dest: 'content'
        }
      ]
    })
  ],
  base: './', // Use relative paths instead of absolute
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        'fab-popup': resolve(__dirname, 'src/fab-popup/index.html'),
        options: resolve(__dirname, 'options.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/whatsapp-injector.ts'),
        'content-page': resolve(__dirname, 'src/content/whatsapp-page-script.ts'),
        'content-loader': resolve(__dirname, 'src/content/script-loader.ts'),
        'content-store-accessor': resolve(__dirname, 'src/content/whatsapp-store-accessor.ts'),
        'content-ui-overlay': resolve(__dirname, 'src/content/whatsapp-ui-overlay.ts'),
        'content-fab': resolve(__dirname, 'src/content/whatsapp-fab.ts'),
        'content-test': resolve(__dirname, 'src/content/whatsapp-injector-test.ts'),
        'test-main-world': resolve(__dirname, 'src/content/test-main-world.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep background and content scripts in their respective folders
          if (chunkInfo.name === 'background') {
            return 'background/service-worker.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/whatsapp-injector.js';
          }
          if (chunkInfo.name === 'content-page') {
            return 'content/whatsapp-page-script.js';
          }
          if (chunkInfo.name === 'content-loader') {
            return 'content/script-loader.js';
          }
          if (chunkInfo.name === 'content-store-accessor') {
            return 'content/whatsapp-store-accessor.js';
          }
          if (chunkInfo.name === 'content-ui-overlay') {
            return 'content/whatsapp-ui-overlay.js';
          }
          if (chunkInfo.name === 'content-fab') {
            return 'content/whatsapp-fab.js';
          }
          if (chunkInfo.name === 'content-test') {
            return 'content/whatsapp-injector-test.js';
          }
          if (chunkInfo.name === 'test-main-world') {
            return 'content/test-main-world.js';
          }
          return '[name].js';
        },
        // chunkFileNames removed because IIFE doesn't support code splitting (usually)
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
