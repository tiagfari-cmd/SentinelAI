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

Primeiro marco web implementado: hook de autenticação server-side em Python,
fila limitada/persistente, worker com reenvio, chave de ingestão idempotente e
token opcional de escrita separado do operador. [Integração e limites](web-integration.md).
Testado com dados fictícios; ainda não ligado a uma aplicação real de uma empresa.

Gestão humana de alertas implementada: por tratar, em análise, resolvido;
nota obrigatória para resolver, histórico paginado na API e revisão otimista
para impedir sobrescritas concorrentes. [Guia](alert-triage.md). A interface usa
texto maior, etiquetas de estado e controlos de teclado; não é certificação WCAG.
O assistente público continua um guia local, não um LLM.

A página pública tem um build separado, com amostra fictícia **e análise de
JSON próprio no browser**, sem upload. Valida o ficheiro inteiro, limita a
1 MiB/5000 eventos, normaliza para UTC e aplica a regra de cinco falhas/60s.
Permite filtrar, investigar e exportar o resultado; eventos e notas ficam só
na memória do separador. [Formato, privacidade e uso numa empresa](browser-analysis.md).
O guia local permite respostas em português ou inglês, sem LLM.
Há testes de ausência de chamadas à API e headers restritivos. A configuração
Cloudflare está no repo; a [demo está publicada](https://sentinelai-demo.tiagfari.workers.dev/)
e foi validada com HTTPS em 13 de outubro de 2026.
Isto não publica a API nem implementa um SaaS com logs reais. Existe código
preparatório de proxy Gemini com quotas, mas permanece desativado: a opção
escolhida é manter o site gratuito, sem faturação ativa ou envio ao provedor.

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
logs reais de vários utilizadores num serviço partilhado. O link público pode
analisar um ficheiro próprio **localmente**, sem o receber no servidor ou ligar
à aplicação que o produziu. Publicar a API completa é um marco distinto e
exige autenticação individual, isolamento dos dados, alojamento, segredos,
base de dados e validação operacional.

## Ideias priorizadas, ainda não implementadas

1. **Contas e funções:** acesso individual, responsabilidades de investigação e
   registo de quem alterou o estado de um alerta. Pré-requisito para partilha segura.
2. **Notificações úteis:** email/webhook com deduplicação e controlo de frequência,
   sem incluir credenciais ou logs completos na mensagem.
3. **Várias aplicações:** identificar a origem dos eventos e separar permissões
   e indicadores; não misturar dados de empresas diferentes.
4. **Retenção e restauro:** política configurável, backups verificados e eliminação
   previsível, acompanhados de processamento incremental e testes de carga.
5. **Mais regras de login:** falhas por utilizador, sucesso após sequência de falhas
   e novos padrões observáveis, com testes e evidência clara para reduzir falsos
   positivos. Sem afirmar automaticamente que houve um ataque.
6. **LLM local no browser:** estudar um modelo pequeno e compatibilidade real;
   não prometer funcionamento em todos os telemóveis nem substituir a deteção
   determinística por respostas probabilísticas.
