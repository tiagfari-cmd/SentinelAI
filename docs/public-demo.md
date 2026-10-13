# Demo pública e instalação completa

**Abrir:** [demo gratuita](https://sentinelai-demo.tiagfari.workers.dev/).
Publicada em 13 de outubro de 2026. Não é necessário criar conta ou fornecer chave.

| Build / modo | Dados e assistente | Publicação |
| --- | --- | --- |
| `npm run build` → `frontend/dist` | API do operador; Gemini opcional no servidor | Docker local ou ambiente privado protegido |
| `npm run build:demo` → `frontend/dist-demo`, amostra | Dados fictícios; guia local português/inglês | Site público, sem chamadas à API de monitorização |
| Mesmo build público, ficheiro próprio | JSON analisado e investigação guardada só em memória; guia local | Browser do visitante; sem upload ou conta |

O modo público é escolhido no build (`vite --mode demo`), não pelo URL.
O build verifica ainda o artefacto: CSP restritiva e ausência dos caminhos de
pedidos ao backend no JavaScript final. Os testes unitários verificam que nenhuma
função pública faz `fetch` neste modo. Não é uma auditoria de segurança completa.
Atualizar a amostra e enviar perguntas ao guia não faz pedidos à API, mesmo com
`VITE_API_BASE_URL` definida. Perguntas ficam na memória do separador; recarregar
a página limpa a conversa. **Analisar ficheiro** lê e valida o JSON no browser,
com limite de 1 MiB/5000 eventos; não faz upload. Os eventos importados e as
notas não são guardados em armazenamento da aplicação nem num servidor.
**Limpar dados locais** e recarregar a página apagam essa análise. As exportações
descarregadas pelo utilizador continuam no seu dispositivo.

Não existe login empresarial, monitorização contínua ou pagamento neste modo.
O alojamento continua a processar pedidos HTTP para carregar o site e pode
manter logs de acesso segundo as suas políticas. Consulta o
[guia de análise local](browser-analysis.md) antes de usar dados próprios.

## Validar localmente

Na pasta `frontend`:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build:demo
npm.cmd run preview -- --outDir dist-demo --host 127.0.0.1 --port 4173
```

`npm ci` continua a ser usado em checkouts novos do CI para respeitar o lockfile.
Remove e recria `node_modules`: evita usá-lo numa pasta sincronizada com OneDrive
ou com servidores de desenvolvimento em execução. Não alteres a política de
scripts do Windows para executar estes comandos.

Verifica os indicadores da amostra (8 eventos fictícios, 1 alerta), pesquisa,
filtros, detalhe e investigação de alertas e o guia português/inglês. Importa
depois um ficheiro fictício válido: confirma a origem local, indicadores e
exportação de análise/eventos. Um ficheiro inválido deve ser rejeitado inteiro,
sem substituir a análise anterior. Limpa os dados e confirma o regresso à amostra.

Não é uma instância partilhada de monitorização nem usa um LLM na configuração
gratuita. O preview Vite não aplica `_headers`; valida-os no alojamento ou
simulador oficial Cloudflare, por exemplo `npx.cmd wrangler dev --local` depois
do build.

## Publicar na Cloudflare

Para novos projetos, a documentação Cloudflare recomenda Workers. O ficheiro
`frontend/wrangler.jsonc` serve `dist-demo` e não encaminha para a API local.
Existe código preparatório de Worker para um futuro proxy de chat e uma quota
em Durable Object, separado da monitorização; **`CHAT_ENABLED=false`** mantém-no
desativado. Não usa essa quota para armazenar ficheiros, eventos ou notas. A
configuração gratuita também não compila chamadas de chat externo no frontend.

1. Entra na tua conta Cloudflare. Não forneças chaves no chat ou no Git.
   No PowerShell, executa `npx.cmd wrangler login` na pasta `frontend` e termina
   o login/autorização no browser. `.cmd` evita depender da política de scripts;
   não precisas de a desativar. Em Linux/macOS, usa `npx wrangler login`.
2. Na integração Git, seleciona **apenas** `tiagfari-cmd/SentinelAI`, branch
   `main`. Novas permissões GitHub devem ser aprovadas pelo proprietário.
3. Define raiz `frontend`, build `npm ci && npm run build:demo` e deploy
   `npx wrangler deploy`. Usa Node 24. Não configures token SentinelAI ou URL de
   backend; mantém o chat externo desativado. Uma chave Gemini, por si só, não
   ativa o proxy e não deve ser colocada em variáveis `VITE_*`.
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
- Guia local permite escolher português ou inglês.
- Importação válida mostra claramente dados do ficheiro, não a amostra.
- Importação inválida não produz resultados parciais nem apaga a análise atual.
- Pesquisa, filtros, exportação e alerta funcionam em desktop e mobile.
- Notas de investigação aparecem no relatório local; os eventos exportados não
  incluem essas notas. Limpar/recarregar elimina o estado da página.
- Headers HTTP contêm CSP e `connect-src 'none'`.
- Bundle não contém credenciais ou chamadas aos endpoints de monitorização.
- Chat externo permanece desativado, mesmo se houver um segredo no servidor.
- Código e instruções de instalação são acessíveis no GitHub.
- Atualizações passam pela `main` protegida e CI; rollback no fornecedor.

**Estado inicial:** demo publicada e HTTPS/headers verificados em 13 de outubro
de 2026. A funcionalidade de análise local pertence à atualização deste marco;
o checklist deve ser repetido em cada publicação. A API completa continua local.
O deploy é efetuado pela CLI autenticada do proprietário; não está configurado
deploy automático a partir do GitHub.

## Usar com eventos próprios

Para uma análise pontual, segue o [guia de ficheiro JSON](browser-analysis.md).
Para acompanhar novos logins de uma aplicação, segue README, Docker Compose e
o [coletor web](web-integration.md) numa instalação privada. O código MIT
permanece gratuito; cada pessoa gere ambiente e dados. Uma versão pública
multiutilizador com logs reais é outro marco: autenticação individual,
autorização/isolamento de dados, limites distribuídos, retenção e operação
segura. Este site não substitui esses requisitos e não é um lançamento SaaS.

## Assistente gratuito e Gemini

O guia local tem respostas pré-definidas; não é um modelo treinado nem um mini
LLM. Há preparação de um proxy limitado para Gemini, mas a configuração atual
nunca o ativa automaticamente por existir uma chave. O visitante não envia
perguntas, ficheiros ou notas ao Google neste modo.

Os [termos Gemini](https://ai.google.dev/gemini-api/terms) exigem serviços pagos
para disponibilizar clientes API a utilizadores no Espaço Económico Europeu,
incluindo Portugal. Por decisão do proprietário, o site mantém-se gratuito sem
ativar faturação nem chat Gemini público. Os limites internos não alteram os
termos nem garantem custo zero; revê também os
[limites do provedor](https://ai.google.dev/gemini-api/docs/rate-limits) antes de
considerar qualquer ativação futura.

Um LLM executado no browser é uma possibilidade a estudar, não uma funcionalidade
presente: exigiria avaliar compatibilidade, memória, download do modelo, licença
e qualidade, mantendo uma alternativa simples nos dispositivos incompatíveis.

Referências: [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
e [headers](https://developers.cloudflare.com/workers/static-assets/headers/).
