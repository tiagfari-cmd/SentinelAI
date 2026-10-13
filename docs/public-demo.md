# Demo pública e instalação completa

| Build | Dados e assistente | Publicação |
| --- | --- | --- |
| `npm run build` → `frontend/dist` | API do operador; Gemini opcional no servidor | Docker local ou ambiente privado protegido |
| `npm run build:demo` → `frontend/dist-demo` | Amostra fictícia e respostas locais pré-definidas | Site estático público, sem API, base de dados ou segredos |

O modo público é escolhido no build (`vite --mode demo`), não pelo URL.
O build verifica ainda o artefacto: CSP restritiva e ausência dos caminhos de
pedidos ao backend no JavaScript final. Os testes unitários verificam que nenhuma
função pública faz `fetch` neste modo. Não é uma auditoria de segurança completa.
Atualizar os dados e enviar perguntas não faz pedidos à API, mesmo com
`VITE_API_BASE_URL` definida. Perguntas ficam na memória do separador; recarregar
a página limpa a conversa. Não existe upload de logs, login, pagamentos ou
recolha de dados por código da aplicação. O alojamento continua a processar
pedidos HTTP e pode manter logs de acesso segundo as suas políticas.

## Validar localmente

Na pasta `frontend`:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build:demo
npm.cmd run preview -- --outDir dist-demo --host 127.0.0.1 --port 4173
```

Verifica os indicadores (8 eventos fictícios, 1 alerta), pesquisa/filtros,
exportação JSON, detalhe de alerta e respostas locais do assistente. Não é uma
instância partilhada de monitorização nem usa um LLM. O preview Vite não aplica
`_headers`; valida-os no alojamento ou simulador oficial Cloudflare.

## Publicar na Cloudflare

Para novos projetos, a documentação Cloudflare recomenda Workers. O ficheiro
`frontend/wrangler.jsonc` serve exclusivamente `dist-demo`; não tem código de
Worker, bindings de dados, segredos ou encaminhamento para a API local.

1. Entra na tua conta Cloudflare. Não forneças chaves no chat ou no Git.
   No PowerShell, executa `npx.cmd wrangler login` na pasta `frontend` e termina
   o login/autorização no browser. `.cmd` evita depender da política de scripts;
   não precisas de a desativar. Em Linux/macOS, usa `npx wrangler login`.
2. Na integração Git, seleciona **apenas** `tiagfari-cmd/SentinelAI`, branch
   `main`. Novas permissões GitHub devem ser aprovadas pelo proprietário.
3. Define raiz `frontend`, build `npm ci && npm run build:demo` e deploy
   `npx wrangler deploy`. Usa Node 24. Não configures Gemini, token SentinelAI
   ou URL de backend.
4. Alternativa: com CLI oficial instalada e autenticada, executa
   `npm.cmd run build:demo` e `npx.cmd wrangler deploy` no PowerShell, na pasta
   `frontend` (Linux/macOS: `npm` e `npx` sem `.cmd`).
5. Usa o subdomínio atribuído. Não compres domínio nem atives recursos pagos
   para este marco. Confirma plano e quotas na tua conta.

O build emite `_headers` com CSP (`connect-src 'none'`), proibição de frames,
`nosniff`, política de referer e restrições de câmara/microfone/geolocalização.
Estilos inline são permitidos porque React/Recharts os usam. Estes headers são
exclusivos da demo: não devem bloquear chamadas do dashboard completo.

### Checklist depois do deploy

- URL HTTPS carrega sem chamadas à API/localhost.
- Chat responde com etiqueta **Resposta local**, sem pedidos de rede.
- Pesquisa, filtros, exportação e alerta funcionam em desktop e mobile.
- Headers HTTP contêm CSP e `connect-src 'none'`.
- Bundle não contém credenciais; nenhuma variável secreta foi configurada.
- Código e instruções de instalação são acessíveis no GitHub.
- Atualizações passam pela `main` protegida e CI; rollback no fornecedor.

**Estado:** configuração preparada; só anunciar URL depois de confirmar deploy.
A API completa continua local.

## Usar com eventos próprios

Segue README e Docker Compose. O código MIT permanece gratuito; cada pessoa
gere ambiente e dados. Uma versão pública multiutilizador com logs reais é
outro marco: autenticação individual, autorização/isolamento de dados, limites
distribuídos, retenção e operação segura. Esta demo não substitui esses
requisitos e não representa um lançamento SaaS.

Referências: [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
e [headers](https://developers.cloudflare.com/workers/static-assets/headers/).
