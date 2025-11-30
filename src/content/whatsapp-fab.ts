/**
 * X1Flox Floating Action Button
 * Draggable button that opens extension popup inside WhatsApp Web
 */

class WhatsAppFAB {
  private fab: HTMLElement | null = null;
  private popup: HTMLElement | null = null;
  private isPopupOpen: boolean = false;
  private isDragging: boolean = false;
  private hasMoved: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private fabStartLeft: number = 0;
  private fabStartTop: number = 0;

  // Bind methods to preserve context
  private boundOnDrag = this.onDrag.bind(this);
  private boundStopDrag = this.stopDrag.bind(this);

  constructor() {
    this.init();
  }

  private init() {
    console.log('[X1Flox FAB] Initializing floating action button...');
    this.createFAB();
    this.setupSettingsListener();
  }

  private setupSettingsListener() {
    // Observe marker attribute changes (set by content script when settings change)
    const marker = document.getElementById('X1FloxInjected');
    if (marker) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'data-show-fab') {
            const showFAB = marker.getAttribute('data-show-fab') === 'true';
            console.log('[X1Flox FAB] Marker attribute changed, showFAB:', showFAB);

            if (showFAB) {
              this.show();
            } else {
              this.hide();
            }
          }
        });
      });

      observer.observe(marker, {
        attributes: true,
        attributeFilter: ['data-show-fab']
      });

      console.log('[X1Flox FAB] ✅ Marker observer registered');
    } else {
      console.error('[X1Flox FAB] ❌ Marker not found, cannot setup listener');
    }
  }

  private show() {
    if (this.fab) {
      console.log('[X1Flox FAB] Showing FAB');
      this.fab.style.display = 'flex';
    }
  }

  private hide() {
    if (this.fab) {
      console.log('[X1Flox FAB] Hiding FAB');
      this.fab.style.display = 'none';
      // Close popup if open
      if (this.isPopupOpen) {
        this.closePopup();
      }
    }
  }

  private createFAB() {
    // Create FAB container
    this.fab = document.createElement('div');
    this.fab.className = 'x1flox-fab-button';
    this.fab.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/>
      </svg>
    `;

    // Set initial position
    const savedPosition = this.getSavedPosition();
    this.fab.style.position = 'fixed';
    this.fab.style.left = savedPosition.left;
    this.fab.style.top = savedPosition.top;
    this.fab.style.zIndex = '999999';

    // Set initial visibility based on settings (read from marker data attributes)
    const marker = document.getElementById('X1FloxInjected');
    const showFabAttr = marker?.getAttribute('data-show-fab');
    // Default to true if attribute is not set yet (race condition protection)
    const showFAB = showFabAttr === null ? true : showFabAttr === 'true';
    this.fab.style.display = showFAB ? 'flex' : 'none';
    console.log('[X1Flox FAB] Initial visibility:', showFAB ? 'visible' : 'hidden', '(attr:', showFabAttr, ')');

    // Add event listeners
    this.fab.addEventListener('mousedown', this.startDrag.bind(this));
    this.fab.addEventListener('click', this.handleClick.bind(this));

    // Add to body
    document.body.appendChild(this.fab);
    console.log('[X1Flox FAB] FAB created at position:', savedPosition);
  }

  private createPopup() {
    if (this.popup) {
      console.log('[X1Flox FAB] Popup already exists, skipping creation');
      return;
    }

    console.log('[X1Flox FAB] Creating popup...');

    try {
      this.popup = document.createElement('div');
      this.popup.className = 'x1flox-fab-popup';

      // Get popup URL from marker data attribute (set by content script)
      // FAB runs in page context and doesn't have access to chrome.runtime
      const marker = document.getElementById('X1FloxInjected');
      const popupUrl = marker?.getAttribute('data-popup-url') || '';
      console.log('[X1Flox FAB] Popup URL:', popupUrl);

      this.popup.innerHTML = `
        <div class="x1flox-fab-popup-header">
          <button class="x1flox-fab-popup-close">✕</button>
        </div>
        <div class="x1flox-fab-popup-content">
          <iframe
            src="${popupUrl}"
            frameborder="0"
            style="width: 100%; height: 100%; border: none;"
          ></iframe>
        </div>
      `;

      console.log('[X1Flox FAB] Popup HTML created');

      // Position popup near FAB
      this.positionPopup();
      console.log('[X1Flox FAB] Popup positioned');

      // Close button (only way to close the popup)
      const closeBtn = this.popup.querySelector('.x1flox-fab-popup-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closePopup();
        });
        console.log('[X1Flox FAB] Close button listener added');
      }

      // Add to body
      document.body.appendChild(this.popup);
      console.log('[X1Flox FAB] Popup appended to body');
      console.log('[X1Flox FAB] Popup created successfully');
    } catch (error) {
      console.error('[X1Flox FAB] Error creating popup:', error);
    }
  }

  private positionPopup() {
    if (!this.popup || !this.fab) return;

    const fabRect = this.fab.getBoundingClientRect();
    const popupWidth = 400;
    const popupHeight = 650;

    // Position to the left of FAB if there's space, otherwise to the right
    let left = fabRect.left - popupWidth - 16;

    if (left < 10) {
      // Not enough space on the left, position to the right
      left = fabRect.right + 16;
    }

    // Make sure it doesn't go off screen
    if (left + popupWidth > window.innerWidth) {
      left = window.innerWidth - popupWidth - 16;
    }
    left = Math.max(10, left);

    // Align top with FAB, but ensure it fits on screen
    let top = fabRect.top;
    if (top + popupHeight > window.innerHeight) {
      top = window.innerHeight - popupHeight - 16;
    }
    top = Math.max(10, top);

    this.popup.style.position = 'fixed';
    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;
    this.popup.style.zIndex = '999998';
  }

  private handleClick(e: MouseEvent) {
    // Only toggle if we didn't drag
    if (this.hasMoved) {
      console.log('[X1Flox FAB] Click ignored - was dragging');
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    console.log('[X1Flox FAB] FAB clicked, toggling popup');
    this.togglePopup();
  }

  private togglePopup() {
    console.log('[X1Flox FAB] togglePopup() called - current state:', this.isPopupOpen ? 'open' : 'closed');
    // Only open popup if closed, never close it (only X button closes)
    if (!this.isPopupOpen) {
      this.openPopup();
    } else {
      console.log('[X1Flox FAB] Popup already open, ignoring click');
    }
  }

  private openPopup() {
    console.log('[X1Flox FAB] openPopup() called');
    console.log('[X1Flox FAB] Current popup state:', this.popup ? 'exists' : 'null');

    if (!this.popup) {
      console.log('[X1Flox FAB] Creating popup for first time...');
      this.createPopup();
    }

    if (this.popup) {
      console.log('[X1Flox FAB] Positioning and opening popup...');
      this.positionPopup();
      this.popup.classList.add('open');
      this.isPopupOpen = true;
      console.log('[X1Flox FAB] Popup opened - classList:', this.popup.className);
      console.log('[X1Flox FAB] Popup style:', {
        opacity: this.popup.style.opacity,
        visibility: this.popup.style.visibility,
        display: this.popup.style.display
      });
    } else {
      console.error('[X1Flox FAB] Failed to create popup!');
    }
  }

  private closePopup() {
    if (this.popup) {
      this.popup.classList.remove('open');
      this.isPopupOpen = false;
      console.log('[X1Flox FAB] Popup closed');
    }
  }

  private startDrag(e: MouseEvent) {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    e.stopPropagation();

    this.isDragging = true;
    this.hasMoved = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    if (this.fab) {
      const rect = this.fab.getBoundingClientRect();
      this.fabStartLeft = rect.left;
      this.fabStartTop = rect.top;

      // Add dragging class
      this.fab.classList.add('dragging');
    }

    document.addEventListener('mousemove', this.boundOnDrag);
    document.addEventListener('mouseup', this.boundStopDrag);

    console.log('[X1Flox FAB] Drag started');
  }

  private onDrag(e: MouseEvent) {
    if (!this.isDragging || !this.fab) return;

    e.preventDefault();
    e.stopPropagation();

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    // If moved more than 3px, consider it a real drag
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      this.hasMoved = true;
    }

    // Calculate new position
    const newLeft = this.fabStartLeft + deltaX;
    const newTop = this.fabStartTop + deltaY;

    // Apply boundaries (keep FAB fully on screen)
    const fabWidth = 56;
    const fabHeight = 56;
    const maxLeft = window.innerWidth - fabWidth - 10;
    const maxTop = window.innerHeight - fabHeight - 10;

    const boundedLeft = Math.max(10, Math.min(maxLeft, newLeft));
    const boundedTop = Math.max(10, Math.min(maxTop, newTop));

    this.fab.style.left = `${boundedLeft}px`;
    this.fab.style.top = `${boundedTop}px`;

    // Update popup position if open
    if (this.isPopupOpen) {
      this.positionPopup();
    }
  }

  private stopDrag(e: MouseEvent) {
    if (!this.isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    this.isDragging = false;

    document.removeEventListener('mousemove', this.boundOnDrag);
    document.removeEventListener('mouseup', this.boundStopDrag);

    if (this.fab) {
      this.fab.classList.remove('dragging');
    }

    // Save position if we actually moved
    if (this.hasMoved && this.fab) {
      this.savePosition();
      console.log('[X1Flox FAB] Position saved after drag');
    }

    console.log('[X1Flox FAB] Drag stopped, hasMoved:', this.hasMoved);
  }

  private getSavedPosition(): { left: string; top: string } {
    const saved = localStorage.getItem('x1flox-fab-position');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback to default
      }
    }
    // Default position: bottom-right corner
    return {
      left: `${window.innerWidth - 76}px`,
      top: `${window.innerHeight - 156}px`
    };
  }

  private savePosition() {
    if (!this.fab) return;

    const position = {
      left: this.fab.style.left,
      top: this.fab.style.top
    };
    localStorage.setItem('x1flox-fab-position', JSON.stringify(position));
    console.log('[X1Flox FAB] Saved position:', position);
  }

  public destroy() {
    if (this.fab) {
      this.fab.remove();
      this.fab = null;
    }
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }
}

// Initialize FAB when DOM is ready
function initializeFAB() {
  console.log('[X1Flox FAB] Script loaded, document.readyState:', document.readyState);
  console.log('[X1Flox FAB] document.body exists:', !!document.body);

  try {
    // Wait for body to exist
    if (!document.body) {
      console.log('[X1Flox FAB] Waiting for document.body...');
      setTimeout(initializeFAB, 100);
      return;
    }

    console.log('[X1Flox FAB] Creating FAB instance...');
    const fabInstance = new WhatsAppFAB();
    console.log('[X1Flox FAB] FAB instance created successfully:', fabInstance);

    // Store reference
    (window as any).x1floxFABInstance = fabInstance;
  } catch (error) {
    console.error('[X1Flox FAB] Error initializing FAB:', error);
  }
}

if (document.readyState === 'loading') {
  console.log('[X1Flox FAB] Document still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', initializeFAB);
} else {
  console.log('[X1Flox FAB] Document already loaded, initializing immediately...');
  initializeFAB();
}

// Export class for external access
(window as any).x1floxFAB = WhatsAppFAB;
