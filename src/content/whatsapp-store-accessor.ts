/**
 * WhatsApp Store Accessor - Metro Bundler Edition
 *
 * WhatsApp Web uses Metro bundler (Facebook's bundler), NOT Webpack!
 * Modules are accessed via: window.require('ModuleName')
 *
 * Key Discovery:
 * - window.require('WAWebCollections') returns all collections (Chat, Msg, Contact, etc.)
 * - window.require.m is UNDEFINED - this is not webpack!
 * - Metro bundler uses __d (define), __w, __t functions
 *
 * VERSION: 3.0 - Metro Bundler Rewrite
 */

(function () {
  'use strict';

  console.log('[PrinChat Store] Initializing WhatsApp Store accessor... [VERSION: 3.0 - METRO]');

  /**
   * Known WhatsApp Metro module names
   * These are the module identifiers used by WhatsApp Web
   */
  const KNOWN_MODULES = {
    // Collections
    COLLECTIONS: 'WAWebCollections',
    CHAT_COLLECTION: 'WAWebChatCollection',
    MSG_COLLECTION: 'WAWebMsgCollection',
    CONTACT_COLLECTION: 'WAWebContactCollection',

    // Messaging
    SEND_MESSAGE: 'WAWebSendMessage',
    SEND_MSG: 'WAWebSendMsgChatAction',

    // User
    USER_PREFS: 'WAWebUserPrefsMeUser',

    // Media
    MEDIA_UPLOAD: 'WAWebMediaUpload',
    MEDIA_OBJECT: 'WAWebMediaObject',

    // Utilities
    WID_FACTORY: 'WAWebWidFactory',
    MSG_KEY: 'WAWebMsgKey',
    GENERATE_ID: 'WAWebGenerateId',
  };

  /**
   * Try to require a Metro module by name
   */
  function requireModule(moduleName: string): any {
    try {
      const win = window as any;

      if (typeof win.require !== 'function') {
        console.log(`[PrinChat Store] window.require is not available (yet)`);
        return null;
      }

      console.log(`[PrinChat Store] Attempting to require: ${moduleName}`);
      const module = win.require(moduleName);

      if (module) {
        console.log(`[PrinChat Store] ✅ Successfully loaded: ${moduleName}`);
        // Log module structure for debugging
        if (typeof module === 'object') {
          const keys = Object.keys(module);
          console.log(`[PrinChat Store]    Module has ${keys.length} exports:`, keys.slice(0, 10).join(', '));
        }
        return module;
      } else {
        console.log(`[PrinChat Store] ⚠️ Module returned null: ${moduleName}`);
        return null;
      }
    } catch (error: any) {
      console.log(`[PrinChat Store] ❌ Failed to require ${moduleName}:`, error.message);
      return null;
    }
  }

  /**
   * Search for modules by trying common patterns
   */
  function searchForModule(baseName: string, patterns: string[]): any {
    console.log(`[PrinChat Store] Searching for ${baseName} using patterns...`);

    for (const pattern of patterns) {
      const module = requireModule(pattern);
      if (module) {
        console.log(`[PrinChat Store] ✅ Found ${baseName} at: ${pattern}`);
        return module;
      }
    }

    console.log(`[PrinChat Store] ⚠️ Could not find ${baseName} in any pattern`);
    return null;
  }

  /**
   * Extract a property from module with fallbacks
   */
  function extractProperty(module: any, propertyNames: string[]): any {
    if (!module) return null;

    for (const propName of propertyNames) {
      if (module[propName]) {
        return module[propName];
      }
      if (module.default && module.default[propName]) {
        return module.default[propName];
      }
    }

    return null;
  }

  /**
   * Initialize WhatsApp Store using Metro bundler
   */
  function initializeStore() {
    try {
      console.log('[PrinChat Store] Starting Metro bundler-based initialization...');

      const win = window as any;

      // Verify window.require exists
      if (typeof win.require !== 'function') {
        throw new Error('window.require is not available - WhatsApp may not be loaded yet');
      }

      console.log('[PrinChat Store] ✅ window.require is available');

      // Create Store object
      const Store: any = {};

      // ==========================================
      // LOAD COLLECTIONS
      // ==========================================
      console.log('[PrinChat Store] Loading collections...');

      const collections = requireModule(KNOWN_MODULES.COLLECTIONS);
      if (collections) {
        // Extract collections from WAWebCollections
        Store.Chat = collections.Chat || collections.ChatCollection;
        Store.Msg = collections.Msg || collections.MsgCollection;
        Store.Contact = collections.Contact || collections.ContactCollection;

        console.log('[PrinChat Store] Collections loaded:', {
          Chat: !!Store.Chat,
          Msg: !!Store.Msg,
          Contact: !!Store.Contact
        });
      }

      // Try individual collection modules as fallback
      if (!Store.Chat) {
        const chatCollection = requireModule(KNOWN_MODULES.CHAT_COLLECTION);
        Store.Chat = extractProperty(chatCollection, ['ChatCollection', 'default', 'Chat']);
      }

      if (!Store.Msg) {
        const msgCollection = requireModule(KNOWN_MODULES.MSG_COLLECTION);
        Store.Msg = extractProperty(msgCollection, ['MsgCollection', 'default', 'Msg']);
      }

      if (!Store.Contact) {
        const contactCollection = requireModule(KNOWN_MODULES.CONTACT_COLLECTION);
        Store.Contact = extractProperty(contactCollection, ['ContactCollection', 'default', 'Contact']);
      }

      // ==========================================
      // LOAD SEND MESSAGE MODULE
      // ==========================================
      console.log('[PrinChat Store] Loading send message module...');

      // Try multiple patterns for send message
      const sendModule = searchForModule('SendMessage', [
        KNOWN_MODULES.SEND_MESSAGE,
        KNOWN_MODULES.SEND_MSG,
        'WAWebSendMsgAction',
        'WAWebSendTextMsgAction',
      ]);

      if (sendModule) {
        // Extract the sendMessage function
        Store.SendMessage = sendModule;

        // Also try to extract specific functions
        Store.sendMessage = extractProperty(sendModule, [
          'addAndSendMsgToChat',
          'sendTextMsg',
          'sendMessage',
          'default'
        ]);

        console.log('[PrinChat Store] SendMessage loaded:', {
          module: !!Store.SendMessage,
          function: !!Store.sendMessage
        });
      }

      // ==========================================
      // LOAD USER INFO
      // ==========================================
      console.log('[PrinChat Store] Loading user info...');

      const userModule = searchForModule('User', [
        KNOWN_MODULES.USER_PREFS,
        'WAWebUserPrefsGeneral',
        'WAWebMeUser',
      ]);

      if (userModule) {
        // Extract the getMeUser function - try multiple names
        const getMeUserFn = userModule.getMaybeMePnUser || userModule.getMePnUserOrThrow || userModule.getMeUser || userModule.getMe;

        if (typeof getMeUserFn === 'function') {
          try {
            Store.Me = getMeUserFn();
            console.log('[PrinChat Store] User loaded via function call:', !!Store.Me);
          } catch (e) {
            console.log('[PrinChat Store] Could not call getMeUser():', e);
          }
        }

        // Also store the user module for access to utility functions
        Store.UserPrefs = userModule;
        console.log('[PrinChat Store] UserPrefs module stored');
      }

      // ==========================================
      // LOAD MESSAGE KEY MODULE
      // ==========================================
      console.log('[PrinChat Store] Loading MsgKey module...');

      const msgKeyModule = searchForModule('MsgKey', [
        KNOWN_MODULES.MSG_KEY,
        'WAWebMsgKeyFactory',
      ]);

      if (msgKeyModule) {
        // WAWebMsgKey exports: fromString, from, newId, newId_DEPRECATED, displayName
        // The module itself is the MsgKey constructor function
        Store.MsgKey = msgKeyModule;
        console.log('[PrinChat Store] MsgKey constructor loaded:', typeof Store.MsgKey);

        // Extract the ID generator from MsgKey module
        if (msgKeyModule.newId) {
          Store.genId = msgKeyModule.newId;
          console.log('[PrinChat Store] ✅ genId extracted from MsgKey.newId');
        } else if (msgKeyModule.newId_DEPRECATED) {
          Store.genId = msgKeyModule.newId_DEPRECATED;
          console.log('[PrinChat Store] ✅ genId extracted from MsgKey.newId_DEPRECATED');
        }
      }

      // No need for separate ID generator module - it's part of MsgKey!

      // ==========================================
      // LOAD WID FACTORY (WhatsApp ID)
      // ==========================================
      console.log('[PrinChat Store] Loading WID factory...');

      const widModule = searchForModule('WidFactory', [
        KNOWN_MODULES.WID_FACTORY,
        'WAWebWidUtils',
      ]);

      if (widModule) {
        Store.WidFactory = extractProperty(widModule, ['createWid', 'createUserWid', 'default']);
        console.log('[PrinChat Store] WidFactory loaded:', !!Store.WidFactory);
      }

      // ==========================================
      // LOAD MEDIA MODULES
      // ==========================================
      console.log('[PrinChat Store] Loading media modules...');

      // WAWebMediaPrep - Upload and send media
      const mediaPrepModule = searchForModule('MediaPrep', [
        'WAWebMediaPrep',
      ]);
      if (mediaPrepModule) {
        // Extract the MediaPrep constructor
        Store.MediaPrepConstructor = mediaPrepModule.MediaPrep || mediaPrepModule.default?.MediaPrep;

        // Keep the whole module for utility functions (they need the module context)
        Store.MediaPrepModule = mediaPrepModule;

        console.log('[PrinChat Store] MediaPrep loaded:', {
          constructor: !!Store.MediaPrepConstructor,
          module: !!Store.MediaPrepModule,
          uploadMediaWithPrep: !!(mediaPrepModule.uploadMediaWithPrep),
          sendMediaMsgToChat: !!(mediaPrepModule.sendMediaMsgToChat)
        });
      }

      // WAWebMediaObject - Media object utilities
      const mediaObjectModule = requireModule(KNOWN_MODULES.MEDIA_OBJECT);
      if (mediaObjectModule) {
        Store.MediaObject = mediaObjectModule;
        console.log('[PrinChat Store] MediaObject loaded');
      }

      // WAWebMediaTypes - Media type constants
      const mediaTypesModule = searchForModule('MediaTypes', [
        'WAWebMediaTypes',
      ]);
      if (mediaTypesModule) {
        Store.MediaTypes = mediaTypesModule;
        console.log('[PrinChat Store] MediaTypes loaded');
      }

      // ==========================================
      // FALLBACK: Try to find modules by inspecting window
      // ==========================================
      console.log('[PrinChat Store] Attempting fallback module discovery...');

      // If we're missing critical modules, try to inspect window for alternatives
      if (!Store.Chat || !Store.SendMessage) {
        console.log('[PrinChat Store] Missing critical modules, trying window inspection...');

        // Look for Store object that might already exist
        if (win.Store && typeof win.Store === 'object') {
          console.log('[PrinChat Store] Found existing window.Store!');

          // Copy missing properties
          if (!Store.Chat && win.Store.Chat) {
            Store.Chat = win.Store.Chat;
            console.log('[PrinChat Store] Copied Chat from window.Store');
          }
          if (!Store.SendMessage && win.Store.SendMessage) {
            Store.SendMessage = win.Store.SendMessage;
            console.log('[PrinChat Store] Copied SendMessage from window.Store');
          }
          if (!Store.Msg && win.Store.Msg) {
            Store.Msg = win.Store.Msg;
            console.log('[PrinChat Store] Copied Msg from window.Store');
          }
        }
      }

      // ==========================================
      // FINALIZE AND EXPOSE
      // ==========================================

      // Count successfully loaded modules
      const loadedModules = Object.keys(Store).filter(key => Store[key] !== null && Store[key] !== undefined);
      console.log('[PrinChat Store] Loaded', loadedModules.length, 'modules:', loadedModules.join(', '));

      // Check if we have minimum required modules
      const hasMinimumModules = Store.Chat && (Store.SendMessage || Store.sendMessage);

      if (!hasMinimumModules) {
        console.error('[PrinChat Store] ❌ Missing critical modules!');
        console.error('[PrinChat Store] Chat:', !!Store.Chat);
        console.error('[PrinChat Store] SendMessage:', !!Store.SendMessage);
        console.error('[PrinChat Store] sendMessage:', !!Store.sendMessage);

        // Still expose what we have for debugging
        win.Store = Store;
        win.__PRINCHAT_STORE_READY__ = false;
        win.__PRINCHAT_STORE_ERROR__ = 'Missing critical modules';

        throw new Error('Missing critical modules for Store initialization');
      }

      // Expose Store globally
      win.Store = Store;
      win.__PRINCHAT_STORE_READY__ = true;

      console.log('[PrinChat Store] ✅✅✅ Store initialized successfully via Metro bundler! ✅✅✅');
      console.log('[PrinChat Store] Available modules:', Object.keys(Store));
      console.log('[PrinChat Store] Store.Chat:', Store.Chat);
      console.log('[PrinChat Store] Store.SendMessage:', Store.SendMessage);

      return Store;

    } catch (error: any) {
      console.error('[PrinChat Store] ❌ Failed to initialize Store:', error);
      console.error('[PrinChat Store] Error details:', error.message);
      console.error('[PrinChat Store] Stack:', error.stack);

      (window as any).__PRINCHAT_STORE_READY__ = false;
      (window as any).__PRINCHAT_STORE_ERROR__ = error.message;

      return null;
    }
  }

  /**
   * Wait for WhatsApp to load Metro bundler
   */
  function waitForWhatsApp() {
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max (500ms intervals)

    console.log('[PrinChat Store] Waiting for WhatsApp Metro bundler to load...');

    const checkInterval = setInterval(() => {
      attempts++;

      const win = window as any;

      // Check for Metro bundler indicators
      const hasRequire = typeof win.require === 'function';
      const hasMetro = typeof win.__d === 'function'; // Metro's define function
      const hasAppLoaded = document.querySelector('[data-app-version]') !== null;

      console.log('[PrinChat Store] Attempt', attempts, '/', maxAttempts, '-', {
        require: hasRequire,
        metro: hasMetro,
        app: hasAppLoaded
      });

      // Try to check if we can access a known module
      let canAccessModules = false;
      if (hasRequire) {
        try {
          const testModule = win.require('WAWebCollections');
          canAccessModules = !!testModule;
          if (canAccessModules) {
            console.log('[PrinChat Store] ✅ Can access WAWebCollections!');
          }
        } catch (e) {
          // Not ready yet
        }
      }

      // Initialize when Metro is ready OR when we timeout
      if (canAccessModules) {
        clearInterval(checkInterval);
        console.log('[PrinChat Store] ✅ Metro bundler ready! Initializing Store...');

        // Give it a moment to stabilize
        setTimeout(() => {
          initializeStore();
        }, 500);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('[PrinChat Store] ❌ Timeout waiting for Metro bundler!');
        console.error('[PrinChat Store] Has require:', hasRequire);
        console.error('[PrinChat Store] Has Metro __d:', hasMetro);
        console.error('[PrinChat Store] App loaded:', hasAppLoaded);

        // Try initialization anyway
        console.log('[PrinChat Store] Attempting initialization anyway...');
        initializeStore();
      }
    }, 500);
  }

  // Start waiting for WhatsApp
  waitForWhatsApp();

})();
