# Segurança do SentinelAI

O SentinelAI é um protótipo educativo, não um serviço pronto para tratar logs
reais em produção. Não publiques dados pessoais, tokens ou chaves nos issues,
pull requests, exemplos ou capturas de ecrã.

## Repositório público

Ver, copiar e usar o código sob a licença MIT não concede permissão para alterar
este repositório. Forks são cópias independentes. Pull requests são propostas;
nunca integres alterações sem rever o código e os resultados dos testes.

A proteção da branch é uma definição do GitHub, não deste ficheiro. Mantém na
`main` PR obrigatório, checks do CI obrigatórios com origem GitHub Actions,
branch atualizada, conversas resolvidas, sem bypass administrativo, force-push
ou eliminação. Revê periodicamente colaboradores e aplicações com acesso.
Não concedas escrita ou administração a pessoas/aplicações não confiáveis.

## API e segredos

- O Compose publica apenas em `127.0.0.1`: acesso local, não acesso público.
- Em desenvolvimento sem `SENTINELAI_API_TOKEN`, os endpoints aceitam pedidos
  sem autenticação. Outros processos no computador também os podem chamar.
- Um token configurado protege eventos, alertas e assistente com Bearer.
- `APP_ENV=production` recusa pedidos protegidos se o token não existir.
- `/health` é público por desenho. CORS não substitui autenticação.
- A chave Gemini fica no backend; nunca uses `VITE_*` para guardar segredos.
- A redação de perguntas Gemini é de melhor esforço, não anonimização garantida.

Antes de exposição pública, exige HTTPS, autenticação individual, autorização,
rate limiting, limites de volume, monitorização, backups e revisão do ambiente.
O token partilhado atual serve apenas para demonstração restrita.

## Reportar um problema

Não publiques provas contendo segredos ou dados reais num issue público. Se o
GitHub disponibilizar **Security → Report a vulnerability**, usa esse canal
privado. Caso contrário, contacta o proprietário em privado antes de partilhar
detalhes exploráveis. Uma chave exposta deve ser revogada no fornecedor e
substituída; removê-la de um commit não a torna novamente segura.
