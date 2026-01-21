import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    // Esta rota será usada futuramente para OAuth callbacks
    // Por enquanto apenas redireciona para login
    return NextResponse.redirect(new URL('/auth/login', request.url))
}
