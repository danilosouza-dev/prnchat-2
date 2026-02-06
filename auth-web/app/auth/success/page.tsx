'use client'

import { useEffect, useState } from 'react'
// import { useSearchParams } from 'next/navigation'

export default function SuccessPage() {
    // const searchParams = useSearchParams()
    const [countdown, setCountdown] = useState(3)

    useEffect(() => {
        // Conta regressiva
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval)
                    window.close()
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E74C7A] to-purple-600">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
                <div className="mb-6">
                    <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Login realizado com sucesso!
                </h1>

                <p className="text-gray-600 mb-6">
                    Você será redirecionado em {countdown} segundos...
                </p>

                <p className="text-sm text-gray-500">
                    Esta janela fechará automaticamente.
                </p>
            </div>
        </div>
    )
}
