# Investigar e resolver alertas

API 0.6.0: a evidência da deteção é separada da conclusão humana. Um alerta não
confirma um ataque e “Resolvido” não significa que o sistema bloqueou um acesso.

## No dashboard

1. Abre **Alertas**. Por omissão aparecem os pendentes: por tratar ou em análise.
2. Abre uma sequência e verifica IP, utilizadores, horas e número de falhas.
3. Escolhe **Em análise**, escreve o próximo passo e guarda a investigação.
4. Confirma os registos na aplicação e contacta a pessoa responsável.
5. Escolhe **Resolvido** e deixa uma conclusão (obrigatória). Podes reabrir
   escolhendo **Por tratar** se surgirem novos elementos.
6. Usa **Todos** ou **Resolvidos** para consultar a evidência anterior.

Não coloques passwords, tokens ou dados desnecessários nas notas (até 1000
caracteres). As notas não são automaticamente enviadas ao Gemini; se as copiares
para uma pergunta, as regras de partilha do assistente continuam a aplicar-se.

## Persistência e conflitos

`POST /alerts/{id}/review` exige o token de **operador**, não o de ingestão:

```json
{
  "review_status": "investigating",
  "review_note": "Confirmar com o responsável se reconhece estes acessos.",
  "expected_revision": 0
}
```

Estados da API: `open`, `investigating`, `resolved`. Cada gravação aceite
incrementa a revisão e acrescenta estado, nota e hora ao histórico numa única
transação. A evidência original não é alterada nem apagada. Novos eventos na
mesma sequência não removem uma conclusão humana já guardada.

Outra janela com uma revisão antiga recebe `409`, sem sobrescrever a mais
recente. Usa **Atualizar detalhes**, revê o estado e escreve novamente a nota.
Atualizar descarta a nota por guardar. A interface não finge uma gravação local
quando a API falha. Uma resposta perdida pode corresponder a uma gravação já
feita: consulta o estado antes de repetir.

`GET /alerts/{id}/reviews?limit=100&offset=0` devolve o histórico mais recente
primeiro e o total em `X-Total-Count`. `limit`: 1–500; `offset`: 0–100000.
Histórico acessível pela API; o formulário mostra só a nota atual. IDs inexistentes
recebem `404`, pedidos inválidos `422`. Aplicam-se os limites normais da API.

O histórico **não é uma auditoria inviolável** e não identifica quem fez cada
alteração: ainda há token de operador partilhado. Faltam contas individuais,
permissões por função e retenção/controlo de acesso a notas com dados pessoais.

## Atualizar sem apagar dados

Faz backup, atualiza o checkout e executa `docker compose up --build -d`.
No modo Python, aplica `alembic upgrade head` antes de reiniciar a API.
A migração `20261013_03` mantém alertas antigos como `open`, com nota vazia e
revisão 0. Usa backend e frontend da mesma versão; não uses `down -v`.

Na amostra fictícia, alterações ficam apenas na memória do separador e
**Atualizar dados** repõe a amostra. O botão diz **Simular alteração**.

Na [análise de um ficheiro próprio no browser](browser-analysis.md), os alertas
são calculados a partir desse ficheiro e a investigação é local, não uma
gravação na API. **Exportar análise** inclui os alertas e as notas atuais; não
é um histórico de auditoria. **Limpar dados locais**, recarregar a página ou
importar outro ficheiro descarta a investigação anterior. A atualização da API
fica indisponível durante a análise local para não substituir esses dados
silenciosamente. No modo ligado à API, **Guardar investigação** persiste a
alteração e o histórico descritos acima.

## Interface e assistente

Texto/controlos maiores, estados identificados por texto além de cor, pesquisa
com etiqueta, foco de teclado visível, link para saltar ao conteúdo, modal com
Escape/Tab e respeito por movimento reduzido. Não é uma certificação WCAG;
falta validação ampla com tecnologias de apoio e utilizadores reais.

O assistente público continua um guia local, sem LLM, com respostas sobre
dashboard, filtros, exportação, investigação e integração web, em português ou
inglês. A importação não lhe envia tabelas de eventos ou notas; o guia não faz
uma investigação automática desses dados. Um LLM no site público exige
segredos só no servidor, limites/custos controlados, revisão dos termos e
informação clara sobre envio das perguntas ao fornecedor. A configuração
gratuita mantém essa integração desativada.
