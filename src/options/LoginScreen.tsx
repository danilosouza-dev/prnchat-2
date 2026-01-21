import { useState } from 'react';

export default function LoginScreen() {
    const [loading, setLoading] = useState(false);

    const handleLogin = () => {
        setLoading(true);

        // Obter URL da página de callback da extensão
        const callbackUrl = chrome.runtime.getURL('callback.html');
        const loginUrl = `http://localhost:3000/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

        // Abrir página de login e monitorar a aba
        chrome.tabs.create({ url: loginUrl }, (tab) => {
            if (!tab.id) return;

            const tabId = tab.id;

            // Listener para mudanças na URL da aba
            const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                if (updatedTabId !== tabId) return;

                // Verifica se chegou na página de sucesso
                if (changeInfo.url && changeInfo.url.includes('/auth/success')) {
                    const url = new URL(changeInfo.url);
                    const accessToken = url.searchParams.get('access_token');
                    const refreshToken = url.searchParams.get('refresh_token');

                    if (accessToken && refreshToken) {
                        // Enviar para background
                        chrome.runtime.sendMessage({
                            type: 'AUTH_SUCCESS',
                            data: { accessToken, refreshToken }
                        }, () => {
                            // Fechar aba de login
                            chrome.tabs.remove(tabId);
                            // Remover listener
                            chrome.tabs.onUpdated.removeListener(listener);
                            setLoading(false);

                            // Abrir ou focar WhatsApp Web
                            chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
                                if (tabs && tabs.length > 0 && tabs[0].id) {
                                    // Já existe uma aba do WhatsApp - focar nela e recarregar
                                    chrome.tabs.update(tabs[0].id, { active: true });
                                    chrome.tabs.reload(tabs[0].id);
                                } else {
                                    // Não existe - criar nova aba
                                    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
                                }
                            });
                        });
                    }
                }
            };

            // Adicionar listener
            chrome.tabs.onUpdated.addListener(listener);

            // Remover listener se aba for fechada manualmente
            const removeListener = (closedTabId: number) => {
                if (closedTabId === tabId) {
                    chrome.tabs.onUpdated.removeListener(listener);
                    chrome.tabs.onRemoved.removeListener(removeListener);
                    setLoading(false);
                }
            };
            chrome.tabs.onRemoved.addListener(removeListener);
        });
    };

    const handleCancel = () => {
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex">
            {/* Lado esquerdo - Card de login */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    {/* Alerta azul */}
                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-sm text-blue-700">
                                <p className="font-medium">Atenção</p>
                                <p className="mt-1">
                                    Esta é a nova era do login de PrinChat. Basta clicar em "Acessar minha conta" para entrar. Não precisa a extensão do Google Chrome. Cole térra alguma dúvida, entre em contato com o suporte.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Logo */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            Acesse sua conta
                        </h1>
                        <p className="text-gray-600">
                            Bem-vindo ao PrinChat, para continuar, clique no botão abaixo para acessar sua conta.
                        </p>
                    </div>

                    {/* Botão de login */}
                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full bg-[#E74C7A] hover:bg-[#D43B69] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>Aguardando confirmação...</span>
                            </>
                        ) : (
                            'Acessar minha conta'
                        )}
                    </button>

                    {loading && (
                        <button
                            onClick={handleCancel}
                            className="w-full mt-3 text-gray-600 hover:text-gray-800 py-2 text-sm"
                        >
                            Cancelar
                        </button>
                    )}

                    {/* Links */}
                    <div className="mt-6 text-center space-y-2">
                        <p className="text-sm">
                            Não é assinante?{' '}
                            <a href="#" className="text-[#E74C7A] hover:underline font-medium">
                                Assine agora mesmo
                            </a>
                        </p>
                        <p className="text-sm text-gray-500">
                            Esqueceu sua senha?{' '}
                            <a href="#" className="text-[#E74C7A] hover:underline">
                                Benefícios Senna
                            </a>
                        </p>
                    </div>
                </div>
            </div>

            {/* Lado direito - Marketing */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#E74C7A] to-purple-600 items-center justify-center p-12">
                <div className="text-white text-center">
                    <h2 className="text-5xl font-bold mb-4 leading-tight">
                        Agilidade,
                        <br />
                        Facilidade
                        <br />& Automatização
                    </h2>
                    <p className="text-xl opacity-90">
                        Gerencie suas mensagens do WhatsApp com eficiência
                    </p>
                </div>
            </div>
        </div>
    );
}
