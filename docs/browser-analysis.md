# Analisar os teus eventos no link público

O [SentinelAI público](https://sentinelai-demo.tiagfari.workers.dev/) não serve
apenas para ver números fictícios: permite abrir um ficheiro JSON próprio,
calcular indicadores, detetar sequências suspeitas, investigar alertas e
descarregar o resultado, sem instalar a API.

Isto é uma análise pontual no browser. Não é uma conta empresarial, um serviço
SaaS, uma ligação automática ao teu site ou monitorização contínua.

## Começar

1. Na página, usa **Descarregar exemplo** para conhecer o formato com dados
   fictícios. Para dados próprios, exporta as tentativas de login da aplicação
   num ficheiro com o contrato abaixo. Não incluas passwords, cookies ou tokens.
2. Seleciona-o em **Ficheiro de eventos JSON** e escolhe **Analisar ficheiro**.
   O browser lê o ficheiro localmente; não o envia à Cloudflare, à API ou a um LLM.
3. Confirma que a origem indicada é a análise de ficheiro local, não a amostra.
   Pesquisa utilizadores/IPs, filtra resultados e abre os alertas encontrados.
4. Em **Alertas**, regista a investigação ou a conclusão. Uma conclusão humana
   não altera a evidência da deteção e não bloqueia nenhum acesso.
5. Usa **Exportar análise** se quiseres guardar indicadores e alertas, incluindo
   as notas locais. **Exportar eventos** descarrega apenas os eventos da vista
   filtrada, sem as notas. Guarda estes ficheiros num local apropriado.
6. Escolhe **Limpar dados locais** para voltar à amostra. Recarregar a página
   também elimina os eventos importados, a investigação local e a conversa.

Os ficheiros que descarregaste não são apagados ao limpar a página. Não existe
gravação automática nem recuperação de uma análise que não exportaste.

## Contrato do ficheiro

Limites: **1 MiB (1 048 576 bytes)** e **5000 eventos** por ficheiro. O conteúdo
tem de ser um array JSON; cada elemento tem exatamente estes quatro campos
obrigatórios (campos adicionais são rejeitados):

```json
[
  {
    "timestamp": "2026-10-13T09:00:00Z",
    "ip_address": "203.0.113.42",
    "username": "utilizador-exemplo",
    "outcome": "failed"
  },
  {
    "timestamp": "2026-10-13T10:00:10+01:00",
    "ip_address": "203.0.113.42",
    "username": "utilizador-exemplo",
    "outcome": "success"
  }
]
```

- `timestamp`: `YYYY-MM-DDTHH:mm:ss[.ffffff]Z` ou com offset `±HH:MM`; aceita
  até seis casas decimais nos segundos. Por exemplo, `2026-10-13T09:00:00Z`.
  Uma hora sem fuso é ambígua e rejeitada; outros formatos ISO não são suportados
  por este importador.
- `ip_address`: endereço IPv4 ou IPv6 válido.
- `username`: identificador não vazio, no máximo 120 caracteres neste modo.
  Prefere um pseudónimo estável e exporta apenas os campos necessários.
- `outcome`: `failed` ou `success` (maiúsculas são normalizadas), decidido pela
  autenticação da aplicação. Um código HTTP 200, por si só, não prova que um
  login foi aceite.

O ficheiro inteiro é validado antes de substituir a análise. Se um registo for
inválido, o pedido é rejeitado: não se ignoram silenciosamente linhas para
produzir um resultado parcial. Corrige o formato e volta a analisar. Não são
aceites CSV, syslog ou exportações de outro fornecedor sem conversão prévia.

## O que é calculado

Os eventos são normalizados para UTC e ordenados. Para cada IP, a regra procura
**cinco ou mais falhas numa janela móvel de 60 segundos**, incluindo os eventos
exatamente a 60 segundos de distância. Uma sequência que continua acima desse
limite não gera um novo alerta em cada falha; pode gerar outro depois de baixar
do limite e voltar a atingi-lo. Logins com sucesso contam nos indicadores, mas
não fazem parte da contagem de falhas desta regra.

A deteção é determinística, não gerada por IA. Um alerta descreve evidência
observada: pode corresponder a um teste autorizado, a dificuldades de um
utilizador ou a atividade maliciosa. Precisa de investigação e contexto.

Importar novamente um ficheiro inicia outra análise e não junta o seu conteúdo
ao anterior. Este modo não deduplica tentativas repetidas dentro do ficheiro:
exporta cada tentativa real uma única vez para não inflacionar a deteção.

## Privacidade e limites

- Os dados, estados de investigação, notas e perguntas do guia ficam apenas
  na memória do separador. Não há gravação em `localStorage`, base de dados da
  aplicação ou servidor neste modo.
- A configuração pública gratuita não envia perguntas ao Gemini. O guia tem
  respostas pré-definidas e um seletor português/inglês; não é um mini LLM.
- O alojamento processa os pedidos normais necessários para entregar a página
  e os seus recursos. “Análise local” não significa que não existe tráfego para
  carregar o site, nem é uma garantia contra extensões ou software no dispositivo.
- Logs e relatórios podem incluir dados pessoais. Analisa apenas dados que tens
  autorização para tratar, minimiza-os e segue as políticas da tua organização.
- Sem armazenamento persistente, contas, alertas por email ou ligação a novos
  eventos. O tamanho limitado torna este modo útil para uma primeira revisão,
  não para históricos grandes ou um centro de operações de segurança.

## Como uma empresa pode aproveitar isto

Para uma primeira avaliação sem instalação, um responsável autorizado exporta
uma amostra de logins da sua aplicação para este contrato, analisa-a no link e
compara os alertas com o contexto real. O resultado pode ajudar a encontrar
sequências para investigar; não demonstra que a empresa está protegida.

Para receber eventos novos, é necessária uma instalação **privada**:

1. Um responsável técnico executa a API e o dashboard com Docker Compose,
   inicialmente em ambiente de teste. [Instruções no README](../README.md#executar-com-docker-compose).
2. Liga o hook à decisão de autenticação no backend da aplicação e executa o
   processo de envio. [Contrato, coletor e configuração](web-integration.md).
3. Se os serviços estiverem em servidores diferentes, configura uma entrada
   HTTPS privada/aprovada, segredos fortes e distintos para operador e ingestão,
   permissões de rede e proteção do disco. Não envia o coletor para o link público.
4. Testa com tentativas fictícias autorizadas: cinco falhas devem gerar um alerta;
   os reenvios com a mesma chave não devem duplicar o evento.
5. Designa quem investiga, define retenção e backups e valida um restauro antes
   de usar dados reais. Começa com um piloto pequeno numa instalação por empresa.

O Compose fornecido só publica portas em loopback e **não instala um ambiente
de produção**. Contas individuais, funções, isolamento multiempresa, limites
distribuídos e operação empresarial continuam na [roadmap](roadmap.md).
