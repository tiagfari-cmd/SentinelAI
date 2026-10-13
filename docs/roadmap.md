# Estado e próximos passos

## Implementado no protótipo

- **Fase 1 — Motor de deteção:** validação de JSON; normalização para UTC; falhas
  fora de ordem; 5 falhas por IP numa janela móvel de 60 segundos; supressão de
  alertas duplicados; testes unitários.
- **Fase 2 — API:** FastAPI, validação Pydantic e endpoints de saúde, eventos,
  alertas, validação do token e assistente.
- **Fase 3 — Persistência:** SQLAlchemy, migração Alembic e SQLite local;
  PostgreSQL compatível via `DATABASE_URL`.
- **Fase 4 — Dashboard:** React/TypeScript, indicadores, gráfico, pesquisa,
  filtro, exportação JSON, detalhe do alerta e fallback de dados fictícios.
- **Fase 5 — Assistente:** mock sem chave por omissão e Gemini opcional no
  backend. Os pedidos externos recebem a pergunta com redação de melhor esforço
  e contagens agregadas; não recebem eventos brutos.
- **Fase 6 — Qualidade básica:** validação de entrada, token partilhado,
  paginação, corpos limitados a 8 KiB, orçamentos globais de pedidos por processo,
  testes, auditoria de dependências no CI, Compose, headers HTTP básicos e
  documentação de segurança. O dashboard identifica vistas parciais e erros HTTP.
- **Fase 7 — Materiais de portfólio:** instruções locais e Docker, arquitetura,
  guião de demonstração, limitações e processo de desenvolvimento.

## Limitações antes de produção

1. Substituir o token partilhado por autenticação individual e autorização com
   sessões seguras.
2. Substituir os limites por processo por limitação partilhada no ponto de entrada
   e por utilizador; limitar armazenamento/retenção e custo de ingestão; testar
   carga e concorrência com a base de dados e múltiplos processos.
3. Configurar logs operacionais sem registar tokens ou dados sensíveis e definir
   métricas, retenção, cópias de segurança e alertas de serviço.
4. Escolher alojamento para API, frontend e PostgreSQL; restringir CORS, TLS,
   segredos e exposição de portas; validar migrações e restauro de dados.
5. Rever retenção/privacidade dos pedidos ao provedor LLM, melhorar redação e
   testar comportamento contra prompt injection em conteúdo do utilizador.
6. Testar com versões reais de Python e Node suportadas, acessibilidade,
   navegadores e ambiente publicado.

## Critério de conclusão deste marco

O protótipo é demonstrável localmente com eventos fictícios, testes reproduzíveis
e documentação transparente. Isso não significa que seja seguro para processar
logs reais nem que esteja publicado na Internet. Uma publicação exige escolher
um fornecedor, configurar segredos e uma base de dados, e efetuar validação do
ambiente alojado.
