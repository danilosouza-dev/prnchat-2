/**
 * Auth Manager - Gerencia autenticação e sessão do usuário
 */

export interface AuthSession {
    isAuthenticated: boolean;
    userId?: string;
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
}

class AuthManager {
    private static instance: AuthManager;
    private session: AuthSession = { isAuthenticated: false };
    private listeners: Set<(session: AuthSession) => void> = new Set();

    private constructor() {
        this.loadSession();
    }

    static getInstance(): AuthManager {
        if (!AuthManager.instance) {
            AuthManager.instance = new AuthManager();
        }
        return AuthManager.instance;
    }

    /**
     * Carrega sessão do storage
     */
    private async loadSession() {
        try {
            const result = await chrome.storage.sync.get(['auth_session']);
            if (result.auth_session) {
                this.session = result.auth_session;
                this.notifyListeners();
            }
        } catch (error) {
            console.error('[Auth] Erro ao carregar sessão:', error);
        }
    }

    /**
     * Salva sessão no storage
     */
    private async saveSession() {
        try {
            await chrome.storage.sync.set({ auth_session: this.session });
            this.notifyListeners();
        } catch (error) {
            console.error('[Auth] Erro ao salvar sessão:', error);
        }
    }

    /**
     * Define sessão autenticada
     */
    async setSession(data: {
        accessToken: string;
        refreshToken: string;
        userId?: string;
        email?: string;
        expiresIn?: number;
    }) {
        this.session = {
            isAuthenticated: true,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            userId: data.userId,
            email: data.email,
            expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
        };
        await this.saveSession();
        console.log('[Auth] Sessão salva com sucesso');
    }

    /**
     * Limpa sessão (logout)
     */
    async clearSession() {
        this.session = { isAuthenticated: false };
        await chrome.storage.sync.remove(['auth_session']);
        this.notifyListeners();
        console.log('[Auth] Sessão removida');
    }

    /**
     * Retorna sessão atual
     */
    getSession(): AuthSession {
        return { ...this.session };
    }

    /**
     * Verifica se está autenticado
     */
    isAuthenticated(): boolean {
        return this.session.isAuthenticated === true;
    }

    /**
     * Registra listener para mudanças de sessão
     */
    addListener(callback: (session: AuthSession) => void) {
        this.listeners.add(callback);
    }

    /**
     * Remove listener
     */
    removeListener(callback: (session: AuthSession) => void) {
        this.listeners.delete(callback);
    }

    /**
     * Notifica listeners sobre mudança
     */
    private notifyListeners() {
        this.listeners.forEach(callback => callback(this.getSession()));
    }

    /**
     * Abre página de login
     */
    openLogin() {
        const extensionId = chrome.runtime.id;
        const callbackUrl = `https://${extensionId}.chromiumapp.org/callback`;
        const loginUrl = `http://localhost:3001/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

        chrome.tabs.create({ url: loginUrl });
    }
}

export const authManager = AuthManager.getInstance();
