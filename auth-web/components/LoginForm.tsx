'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const supabase = createClient()

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
            })

            if (error) throw error

            // Redirecionar para página de sucesso com tokens na URL
            // A extensão vai monitorar essa aba e pegar os tokens
            if (data.session) {
                const successUrl = `/auth/success?access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&callback=${encodeURIComponent(callbackUrl || '')}`
                window.location.href = successUrl
            }
        } catch (error: any) {
            console.error('[Login Error]', error)
            console.error('[Login Error Details]', {
                message: error.message,
                status: error.status,
                code: error.code
            })
            setError(error.message || 'Erro ao fazer login')
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleLogin} className="space-y-4">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Digite seu e-mail"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Senha
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Digite sua senha"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Entrando...' : 'Acessar minha conta'}
            </button>
        </form>
    )
}
