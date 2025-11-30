/**
 * Test script to verify MAIN world execution
 */

console.log('🔥🔥🔥 TEST MAIN WORLD SCRIPT EXECUTING! 🔥🔥🔥');
console.log('window.location.href:', window.location.href);
console.log('Has webpackChunkwhatsapp_web_client?', !!(window as any).webpackChunkwhatsapp_web_client);

// Try to inject a visible marker
const marker = document.createElement('div');
marker.id = 'TEST_MAIN_WORLD_MARKER';
marker.style.cssText = 'position:fixed;top:10px;left:10px;background:red;color:white;padding:20px;z-index:999999;font-size:20px;';
marker.textContent = '🔥 MAIN WORLD TEST OK!';
document.body?.appendChild(marker);

console.log('🔥🔥🔥 TEST MARKER CREATED! 🔥🔥🔥');
