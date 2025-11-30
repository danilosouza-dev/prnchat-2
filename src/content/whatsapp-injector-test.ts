/**
 * MINIMAL TEST SCRIPT
 * If this doesn't load, we have a fundamental injection problem
 */

console.log('=================================');
console.log('X1FLOX TEST SCRIPT LOADED!');
console.log('Time:', new Date().toISOString());
console.log('URL:', window.location.href);
console.log('=================================');

// Create visible marker
const div = document.createElement('div');
div.id = 'X1FLOX_TEST_LOADED';
div.style.cssText = 'position:fixed;top:0;left:0;background:red;color:white;padding:20px;z-index:99999;';
div.textContent = '✅ X1FLOX TEST SCRIPT LOADED!';
document.body?.appendChild(div);

// Remove after 3 seconds
setTimeout(() => div.remove(), 3000);
