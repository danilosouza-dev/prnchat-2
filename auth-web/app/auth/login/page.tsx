import LoginForm from '@/components/LoginForm'
import Image from 'next/image'

export default function LoginPage({
    searchParams,
}: {
    searchParams: { callbackUrl?: string }
}) {
    return (
        <div className="min-h-screen flex">
            {/* Lado esquerdo - Formulário */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            Acesse sua conta
                        </h1>
                        <p className="text-gray-600">
                            Bem-vindo ao PrinChat, para continuar, entre com suas credenciais.
                        </p>
                    </div>

                    <LoginForm callbackUrl={searchParams.callbackUrl} />

                    <div className="mt-6 text-center text-sm">
                        <a href="#" className="text-primary hover:underline">
                            Esqueceu a senha?
                        </a>
                    </div>
                </div>
            </div>

            {/* Lado direito - Imagem de marketing */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-purple-600 items-center justify-center p-12">
                <div className="text-white text-center">
                    <h2 className="text-5xl font-bold mb-4">
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
    )
}
