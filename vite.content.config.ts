import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false, // Don't wipe the dist folder (main build does that)
        rollupOptions: {
            input: {
                'content/whatsapp-injector': resolve(__dirname, 'src/content/whatsapp-injector.ts'),
                'content/whatsapp-page-script': resolve(__dirname, 'src/content/whatsapp-page-script.ts'),
                'content/script-loader': resolve(__dirname, 'src/content/script-loader.ts'),
                'content/whatsapp-store-accessor': resolve(__dirname, 'src/content/whatsapp-store-accessor.ts'),
                'content/whatsapp-ui-overlay': resolve(__dirname, 'src/content/whatsapp-ui-overlay.ts'),
                'content/whatsapp-fab': resolve(__dirname, 'src/content/whatsapp-fab.ts'),
                'content/whatsapp-injector-test': resolve(__dirname, 'src/content/whatsapp-injector-test.ts'),
                'content/test-main-world': resolve(__dirname, 'src/content/test-main-world.ts')
            },
            output: {
                format: 'iife',
                // For multiple inputs in IIFE, we unfortunately can't use inlineDynamicImports: true widely 
                // IF they depend on separate things.
                // BUT strict single-file output per input IS desired.
                // Rollup might still complain about multiple inputs with iife/umd.
                // If it does, we have to build them one by one? 
                // actually, if we don't set inlineDynamicImports: true, code splitting might try to happen?
                // Let's rely on standard code duplication for IIFE multiple inputs (if supported).
                // If Rollup fails "IIFE format is not supported for code-splitting builds", 
                // then we MUST use an array of outputs or multiple builds.
                // Or simply: output.manualChunks = undefined

                entryFileNames: '[name].js',
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
