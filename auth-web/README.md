# PrinChat Auth Web

Projeto Next.js para autenticação do PrinChat.

## Setup

1. **Copie o arquivo de ambiente:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edite `.env.local` com suas credenciais Supabase:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://lblhppgtbfgmnplfeoak.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **Instale as dependências:**
   ```bash
   npm install
   ```

4. **Rode em desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse:**
   ```
   http://localhost:3001/auth/login
   ```

## Estrutura

```
auth-web/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx      # Página de login
│   │   └── callback/route.ts   # Callback OAuth
│   ├── layout.tsx              # Layout raiz
│   └── globals.css             # Estilos globais
├── components/
│   └── LoginForm.tsx           # Formulário de login
├── lib/
│   └── supabase.ts             # Cliente Supabase
└── .env.local                  # Credenciais (criar manualmente)
```

## Próximos Passos

- [ ] Criar usuário de teste no Supabase
- [ ] Testar login em localhost
- [ ] Integrar com extensão Chrome
- [ ] Deploy na Vercel
