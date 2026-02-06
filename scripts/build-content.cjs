const { build } = require('vite');
const { resolve } = require('path');

const contentScripts = {
    'content/whatsapp-injector': 'src/content/whatsapp-injector.ts',
    'content/whatsapp-page-script': 'src/content/whatsapp-page-script.ts',
    'content/script-loader': 'src/content/script-loader.ts',
    'content/whatsapp-store-accessor': 'src/content/whatsapp-store-accessor.ts',
    'content/whatsapp-ui-overlay': 'src/content/whatsapp-ui-overlay.ts',
    'content/whatsapp-fab': 'src/content/whatsapp-fab.ts',
    'content/whatsapp-injector-test': 'src/content/whatsapp-injector-test.ts',
    'content/test-main-world': 'src/content/test-main-world.ts'
};

async function buildContentScripts() {
    console.log('Building content scripts individually (IIFE format)...');

    for (const [name, entry] of Object.entries(contentScripts)) {
        console.log(`Building ${name}...`);
        try {
            await build({
                configFile: false, // Don't use vite.config.ts
                build: {
                    outDir: 'dist',
                    emptyOutDir: false, // Append to dist
                    lib: {
                        entry: resolve(__dirname, '../', entry),
                        name: name.replace(/[\/-]/g, '_'), // Global variable name (unused but required)
                        formats: ['iife'],
                        fileName: () => `${name}.js`
                    },
                    rollupOptions: {
                        output: {
                            // Ensure assets like CSS are handled - though lib mode usually inlines them or emits style.css
                            assetFileNames: 'assets/[name]-[hash].[ext]'
                        }
                    }
                },
                resolve: {
                    alias: {
                        '@': resolve(__dirname, '../src')
                    }
                }
            });
        } catch (e) {
            console.error(`Failed to build ${name}:`, e);
            process.exit(1);
        }
    }
    console.log('All content scripts built successfully.');
}

buildContentScripts();
