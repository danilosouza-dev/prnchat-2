/**
 * Callback Script - Processa tokens de autenticação da URL
 */

(function () {
    const messageEl = document.getElementById('message');

    try {
        // Extrai tokens da URL
        const params = new URLSearchParams(window.location.search);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken || !refreshToken) {
            throw new Error('Tokens não encontrados na URL');
        }

        if (messageEl) {
            messageEl.textContent = 'Autenticação bem-sucedida! Salvando...';
        }

        // Envia tokens para o background script
        chrome.runtime.sendMessage({
            type: 'AUTH_SUCCESS',
            data: {
                accessToken,
                refreshToken
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Erro ao enviar mensagem:', chrome.runtime.lastError);
                if (messageEl) {
                    messageEl.textContent = 'Erro ao processar autenticação.';
                }
                return;
            }

            if (messageEl) {
                messageEl.textContent = 'Sucesso! Fechando...';
                messageEl.className = 'success';
            }

            // Fecha a aba após 1 segundo
            setTimeout(() => {
                window.close();
            }, 1000);
        });

    } catch (error) {
        console.error('[Callback] Erro:', error);
        if (messageEl) {
            messageEl.textContent = 'Erro: ' + error.message;
            messageEl.style.color = '#ef4444';
        }
    }
})();
