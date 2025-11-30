/**
 * Script Loader - Injected into MAIN world
 * This small script loads WPPConnect and our page script via DOM injection
 *
 * TRICK: We extract the extension ID from document.currentScript.src!
 */

(async function() {
  'use strict';

  console.log('[X1Flox Loader] Starting...');

  // Extract extension ID from current script's src attribute
  // When this script is injected via chrome.scripting.executeScript with world:MAIN,
  // it won't have currentScript, so we need another way

  // Alternative: The content script will pass the extension ID via a data attribute
  const marker = document.getElementById('x1flox-marker');
  const extensionId = marker?.getAttribute('data-extension-id');

  if (!extensionId) {
    console.error('[X1Flox Loader] ❌ Extension ID not found!');
    return;
  }

  console.log('[X1Flox Loader] Extension ID:', extensionId);

  // Helper to inject a script from URL into page context
  function injectScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        console.log('[X1Flox Loader] ✅ Loaded:', url);
        resolve();
      };
      script.onerror = () => {
        console.error('[X1Flox Loader] ❌ Failed to load:', url);
        reject(new Error(`Failed to load: ${url}`));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  try {
    // STEP 1: Load WPPConnect library from local extension
    console.log('[X1Flox Loader] Loading WPPConnect library...');
    try {
      await injectScript(`chrome-extension://${extensionId}/wppconnect-wa.js`);
      console.log('[X1Flox Loader] ✅ WPPConnect loaded');
    } catch (wppError) {
      console.warn('[X1Flox Loader] ⚠️ WPPConnect load failed, will use fallback:', wppError);
    }

    // STEP 2: Inject Store Accessor (lightweight module raid script)
    console.log('[X1Flox Loader] Loading Store Accessor...');
    console.log('[X1Flox Loader] URL:', `chrome-extension://${extensionId}/content/whatsapp-store-accessor.js`);
    await injectScript(`chrome-extension://${extensionId}/content/whatsapp-store-accessor.js`);

    // Wait for Store to initialize
    console.log('[X1Flox Loader] Waiting for Store to initialize...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 3: Inject our page script
    console.log('[X1Flox Loader] Loading page script...');
    console.log('[X1Flox Loader] URL:', `chrome-extension://${extensionId}/content/whatsapp-page-script.js`);
    await injectScript(`chrome-extension://${extensionId}/content/whatsapp-page-script.js`);

    console.log('[X1Flox Loader] ✅ All scripts loaded successfully!');
    console.log('[X1Flox Loader] Checking if page script executed...');
    console.log('[X1Flox Loader] __X1FLOX_INJECTED__:', !!(window as any).__X1FLOX_INJECTED__);
    console.log('[X1Flox Loader] __X1FLOX_VERSION__:', (window as any).__X1FLOX_VERSION__);
    console.log('[X1Flox Loader] WPP available:', !!((window as any).WPP));

  } catch (error) {
    console.error('[X1Flox Loader] ❌ Error loading scripts:', error);
  }
})();
