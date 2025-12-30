/**
 * Script Loader - Injected into MAIN world
 * This small script loads WPPConnect and our page script via DOM injection
 *
 * TRICK: We extract the extension ID from document.currentScript.src!
 */

(async function () {
  'use strict';

  console.log('[PrinChat Loader] 🚀 Starting...');

  // Extract extension ID from current script's src attribute
  // When this script is injected via chrome.scripting.executeScript with world:MAIN,
  // it won't have currentScript, so we need another way

  // Alternative: The content script will pass the extension ID via a data attribute
  const marker = document.getElementById('princhat-marker');
  const extensionId = marker?.getAttribute('data-extension-id');

  if (!extensionId) {
    console.error('[PrinChat Loader] ❌ Extension ID not found in marker!');
    console.error('[PrinChat Loader] Marker element:', marker);
    return;
  }

  console.log('[PrinChat Loader] ✅ Extension ID:', extensionId);

  // Helper to inject a script from URL into page context
  function injectScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[PrinChat Loader] 📥 Attempting to load:', url);
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        console.log('[PrinChat Loader] ✅ Loaded:', url);
        resolve();
      };
      script.onerror = (error) => {
        console.error('[PrinChat Loader] ❌ Failed to load:', url);
        console.error('[PrinChat Loader] Error details:', error);
        reject(new Error(`Failed to load: ${url}`));
      };
      (document.head || document.documentElement).appendChild(script);
      console.log('[PrinChat Loader] 📌 Script tag appended to DOM');
    });
  }

  try {
    // STEP 1: Load WPPConnect library from local extension
    console.log('[PrinChat Loader] 📦 Loading WPPConnect library...');
    const wppUrl = `chrome-extension://${extensionId}/wppconnect-wa.js`;
    console.log('[PrinChat Loader] WPPConnect URL:', wppUrl);

    try {
      await injectScript(wppUrl);
      console.log('[PrinChat Loader] ✅ WPPConnect loaded');
    } catch (wppError) {
      console.warn('[PrinChat Loader] ⚠️ WPPConnect load failed, will use fallback:', wppError);
    }

    // STEP 2: Inject Store Accessor (lightweight module raid script)
    console.log('[PrinChat Loader] 📦 Loading Store Accessor...');
    const storeUrl = `chrome-extension://${extensionId}/content/whatsapp-store-accessor.js`;
    console.log('[PrinChat Loader] Store Accessor URL:', storeUrl);

    await injectScript(storeUrl);
    console.log('[PrinChat Loader] ✅ Store Accessor loaded');

    // Wait for Store to initialize
    console.log('[PrinChat Loader] ⏳ Waiting 2s for Store to initialize...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 3: Inject our page script
    console.log('[PrinChat Loader] 📦 Loading page script...');
    const pageScriptUrl = `chrome-extension://${extensionId}/content/whatsapp-page-script.js`;
    console.log('[PrinChat Loader] Page script URL:', pageScriptUrl);

    await injectScript(pageScriptUrl);
    console.log('[PrinChat Loader] ✅ Page script loaded');

    console.log('[PrinChat Loader] 🎉 All scripts loaded successfully!');

    // Check if page script executed
    setTimeout(() => {
      console.log('[PrinChat Loader] 🔍 Checking if page script executed...');
      console.log('[PrinChat Loader] __PRINCHAT_INJECTED__:', !!(window as any).__PRINCHAT_INJECTED__);
      console.log('[PrinChat Loader] __PRINCHAT_VERSION__:', (window as any).__PRINCHAT_VERSION__);
      console.log('[PrinChat Loader] WPP available:', !!((window as any).WPP));
      console.log('[PrinChat Loader] Store available:', !!((window as any).Store));

      if (!(window as any).__PRINCHAT_INJECTED__) {
        console.error('[PrinChat Loader] ⚠️ Page script loaded but did NOT execute!');
        console.error('[PrinChat Loader] This suggests a runtime error in whatsapp-page-script.js');
      }
    }, 1000);

  } catch (error) {
    console.error('[PrinChat Loader] ❌ FATAL ERROR loading scripts:', error);
    console.error('[PrinChat Loader] Error type:', typeof error);
    console.error('[PrinChat Loader] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[PrinChat Loader] Error stack:', error instanceof Error ? error.stack : 'no stack');
  }
})();
