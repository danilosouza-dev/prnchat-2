import React, { useState, useEffect } from 'react';
import logo from '../assets/logo.png';

const ExtensionPopup: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [authLoading, setAuthLoading] = useState(true);

    // Check authentication
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const result = await chrome.storage.sync.get(['auth_session']);
                setIsAuthenticated(result.auth_session?.isAuthenticated === true);
            } catch (error) {
                console.error('[Popup] Error checking auth:', error);
                setIsAuthenticated(false);
            } finally {
                setAuthLoading(false);
            }
        };

        checkAuth();

        // Listen for auth changes
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.auth_session) {
                setIsAuthenticated(changes.auth_session.newValue?.isAuthenticated === true);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    const openOptions = () => {
        chrome.runtime.openOptionsPage();
    };

    const openWhatsApp = () => {
        chrome.tabs.create({ url: 'https://web.whatsapp.com' });
    };

    const openCRM = () => {
        // TODO: Add CRM URL when ready
        alert('PrinChat CRM - Em breve!');
    };

    const handleLogout = () => {
        if (confirm('Tem certeza que deseja sair?')) {
            chrome.storage.sync.remove(['auth_session'], () => {
                chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
                    if (tabs && tabs.length > 0 && tabs[0].id) {
                        chrome.tabs.reload(tabs[0].id);
                    }
                });
            });
        }
    };

    if (authLoading) {
        return (
            <div style={{
                width: '300px',
                background: '#1a1a1a',
                padding: '30px',
                textAlign: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div style={{ color: '#9e9e9e' }}>Carregando...</div>
            </div>
        );
    }

    // Not authenticated - show login
    if (!isAuthenticated) {
        return (
            <div style={{
                width: '300px',
                background: '#1a1a1a',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #2a2a2a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <img src={logo} alt="PrinChat" style={{ height: '24px' }} />
                    <button
                        onClick={openOptions}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#e91e63',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 8px',
                            borderRadius: '4px',
                            transition: 'background 0.2s',
                            fontWeight: 600
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(233, 30, 99, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                            <polyline points="10 17 15 12 10 7" />
                            <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                        Fazer Login
                    </button>
                </div>

                {/* Action buttons */}
                <div style={{ padding: '16px 20px' }}>
                    <button
                        onClick={openWhatsApp}
                        style={{
                            width: '100%',
                            padding: '10px',
                            marginBottom: '8px',
                            background: '#2a2a2a',
                            border: '1px solid #3a3a3a',
                            borderRadius: '6px',
                            color: '#e0e0e0',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontWeight: 500
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = '#333';
                            e.currentTarget.style.borderColor = '#e91e63';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = '#2a2a2a';
                            e.currentTarget.style.borderColor = '#3a3a3a';
                        }}
                    >
                        Abrir WhatsApp Web
                    </button>

                    <button
                        onClick={openCRM}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: '#2a2a2a',
                            border: '1px solid #3a3a3a',
                            borderRadius: '6px',
                            color: '#e0e0e0',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontWeight: 500
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = '#333';
                            e.currentTarget.style.borderColor = '#e91e63';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = '#2a2a2a';
                            e.currentTarget.style.borderColor = '#3a3a3a';
                        }}
                    >
                        Abrir PrinChat CRM
                    </button>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px',
                    borderTop: '1px solid #2a2a2a',
                    textAlign: 'center',
                    fontSize: '10px',
                    color: '#666',
                    lineHeight: '1.4'
                }}>
                    <div>princhat.com.br - v1.0.0</div>
                    <div>Copyright © 2026</div>
                </div>
            </div>
        );
    }

    // Authenticated - same design with logout
    return (
        <div style={{
            width: '300px',
            background: '#1a1a1a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <img src={logo} alt="PrinChat" style={{ height: '24px' }} />
                <button
                    onClick={handleLogout}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#e91e63',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                        fontWeight: 600
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(233, 30, 99, 0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sair
                </button>
            </div>

            {/* Action buttons */}
            <div style={{ padding: '16px 20px' }}>
                <button
                    onClick={openWhatsApp}
                    style={{
                        width: '100%',
                        padding: '10px',
                        marginBottom: '8px',
                        background: '#2a2a2a',
                        border: '1px solid #3a3a3a',
                        borderRadius: '6px',
                        color: '#e0e0e0',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: 500
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = '#333';
                        e.currentTarget.style.borderColor = '#e91e63';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = '#2a2a2a';
                        e.currentTarget.style.borderColor = '#3a3a3a';
                    }}
                >
                    Abrir WhatsApp Web
                </button>

                <button
                    onClick={openCRM}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: '#2a2a2a',
                        border: '1px solid #3a3a3a',
                        borderRadius: '6px',
                        color: '#e0e0e0',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: 500
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = '#333';
                        e.currentTarget.style.borderColor = '#e91e63';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = '#2a2a2a';
                        e.currentTarget.style.borderColor = '#3a3a3a';
                    }}
                >
                    Abrir PrinChat CRM
                </button>
            </div>

            {/* Footer */}
            <div style={{
                padding: '12px',
                borderTop: '1px solid #2a2a2a',
                textAlign: 'center',
                fontSize: '10px',
                color: '#666',
                lineHeight: '1.4'
            }}>
                <div>princhat.com.br - v1.0.0</div>
                <div>Copyright © 2026</div>
            </div>
        </div>
    );
};

export default ExtensionPopup;
