# Integrar logins de uma aplicação web

Primeiro marco do piloto autoalojado: a aplicação regista o resultado de cada
login no servidor, coloca o evento numa fila SQLite privada e um processo
separado envia-o à API SentinelAI. Não exige SaaS, pagamentos ou Gemini.

O coletor inicial é Python 3.11+, apenas com biblioteca padrão. Não é um plugin
automático para qualquer framework: o responsável pela aplicação tem de ligar
o hook à sua lógica de autenticação. Outros backends podem implementar o mesmo
contrato HTTP. Ainda não existe SDK Node/PHP, login individual no SentinelAI,
serviço instalado automaticamente, notificação externa ou validação empresarial.

## 1. Atualizar a instalação SentinelAI

É necessária a API 0.5.0 ou posterior, com a migração `20261013_02`.
Faz backup antes de atualizar uma instalação com dados próprios. No Docker:

```powershell
git pull --ff-only
docker compose up --build -d
```

O arranque aplica a migração e mantém os eventos existentes. Não uses `down -v`.
Na instalação Python, executa `alembic upgrade head` antes de reiniciar a API.
Uma API anterior não confirma a idempotência: o coletor bloqueia a linha em vez
de a remover silenciosamente. Corrige a versão/configuração antes de reprocessar.

Para um piloto privado, configura no servidor `APP_ENV=production`,
`SENTINELAI_API_TOKEN` para o operador e um **valor diferente**, aleatório e forte,
em `SENTINELAI_INGEST_TOKEN` para a aplicação que envia eventos. O token de
ingestão só autoriza `POST /events`: não lê eventos/alertas nem usa o assistente.
Tokens de operador continuam compatíveis, mas não devem ser entregues ao coletor.
O modo de desenvolvimento local continua sem token por omissão; não o exponhas.

## 2. Ligar o hook à aplicação (no backend, nunca no browser)

Copia o pacote `collectors` e adapta o exemplo `examples/web_login_hook.py` ao
backend Python da aplicação. Em alternativa, inclui o checkout no teu ambiente
de desenvolvimento. Exemplo de configuração no arranque:

```python
import os
from collectors.web_auth import WebAuthCollector
from examples.web_login_hook import observe_web_login

collector = WebAuthCollector(
    os.environ["SENTINELAI_QUEUE_PATH"],
    os.environ["SENTINELAI_COLLECTOR_URL"],
    os.environ.get("SENTINELAI_INGEST_TOKEN", ""),
)

# Imediatamente DEPOIS da decisão da tua autenticação, chama:
# queued = observe_web_login(collector, username=account_identifier,
#                           client_ip=trusted_client_ip, authenticated=login_succeeded)
# Mantém a resposta de login original: queued indica só gravação local.
```

`login_succeeded` é um booleano decidido pelo teu backend. Não deduzas o resultado
de um simples HTTP 200, nem aceites um resultado/IP indicado pelo browser.
Obtém o IP da ligação ou de um proxy configurado e de confiança; não copies
`X-Forwarded-For` de qualquer pedido. Usa um identificador estável, limitado a
255 caracteres, e preferencialmente pseudónimo, não uma password ou token.

Regista apenas uma tentativa por decisão de autenticação. O helper aceita
exclusivamente data UTC/com fuso, IP, identificador de utilizador e resultado.
Não aceita passwords, cookies, cabeçalhos completos, corpo do pedido ou URLs.
Uma falha de gravação gera aviso genérico e `False`, sem alterar o resultado
do login; é preciso monitorizar esses avisos porque eventos podem não ser guardados.

## 3. Executar o processo de envio

Na raiz do checkout (ou no ambiente que inclui `collectors`), configura o mesmo
caminho de fila e destino utilizados pela aplicação:

```powershell
$env:SENTINELAI_COLLECTOR_URL = "http://127.0.0.1:8001"
# Usa um caminho PRIVADO fora de pastas servidas pela aplicação e fora do Git.
# Define SENTINELAI_INGEST_TOKEN no gestor de segredos/ambiente deste processo.
py -m collectors.web_auth run --queue "C:\SentinelAI-private\web-outbox.db"
```

O exemplo HTTP só funciona em loopback. Para outro servidor, o coletor exige
HTTPS e token, valida certificados, não segue redirecionamentos e não usa proxies
implícitos do sistema/ambiente. Não suporta desligar a validação TLS. Para redes
privadas usa um ponto de entrada HTTPS aprovado; isto não instala esse ponto de
entrada nem expõe o teu Docker na rede. Não uses o endereço da demo pública.

Por omissão há uma tentativa a cada 2 segundos e timeout de socket de 5 segundos.
Não envies pela rede dentro da função de login; deixa o worker correr à parte.
Num ambiente real, o operador tem de configurar supervisão/arranque do processo
e acesso à mesma fila persistente. Não copies a fila para instâncias independentes.

Comandos de operação:

```powershell
py -m collectors.web_auth stats --queue "C:\SentinelAI-private\web-outbox.db"
py -m collectors.web_auth once --queue "C:\SentinelAI-private\web-outbox.db"
# Só depois de corrigir autenticação, versão ou um erro permanente:
py -m collectors.web_auth retry-blocked --queue "C:\SentinelAI-private\web-outbox.db"
```

Os comandos leem URL e token das mesmas variáveis de ambiente; `.env` não é
carregado automaticamente pelo coletor. Saída contém estados/contagens/códigos,
não utilizadores, IPs, resposta do servidor ou credenciais.

## Entrega, privacidade e limites

- Cada tentativa real recebe uma chave aleatória estável. Reenvios preservam
  chave, data e conteúdo. A API guarda a chave com índice único: `201` para o
  primeiro envio, `200` para repetição igual, `409` se a chave tiver outro conteúdo.
  A resposta confirma `Idempotency-Key`; o coletor exige esse header e um evento
  correspondente antes de remover a linha da fila.
- Sem rede, `408`, `429` e `5xx`: reenvio com espera exponencial até 300 segundos;
  `Retry-After` numérico aumenta a espera, limitado a 24 horas. Outras respostas,
  redirects ou resposta incompatível ficam bloqueados para investigação manual.
- Filas sobrevivem ao reinício. Uma reserva de 120 segundos recupera após crash;
  entregas repetidas continuam possíveis, mas a API deduplica as mesmas chaves.
  Não há garantia de entrega sem falhas nem transação conjunta com a base da aplicação.
- A fila está presa ao destino original. Mudar de API requer outro ficheiro,
  evitando enviar eventos pendentes inadvertidamente para outra instalação.
- Capacidade padrão: 10000 linhas (pendentes + bloqueadas). Ao atingir o limite,
  não substitui linhas antigas: recusa novas e o hook avisa. Este limite é por
  registos, não quota de disco. Mais workers partilham os limites da API.
- A fila guarda IPs e identificadores em claro, **nunca o token de envio**.
  Protege diretório, ACLs no Windows/permissões no Linux, disco e backups.
  O coletor cria ficheiros novos com modo `0600` em sistemas que o suportam;
  não configura ACLs Windows nem cifra dados. Linhas confirmadas são removidas;
  linhas pendentes/bloqueadas não expiram automaticamente.
- Este piloto continua sem retenção do histórico na API, processamento
  incremental, contas de operador individuais ou limitação distribuída.
  Cada empresa deve ter a sua instalação; não partilhes esta API entre empresas.

## Verificação reproduzível, sem dados reais

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Os testes ligam coletor → API → deteção em bases temporárias e verificam cinco
falhas → um alerta, resposta perdida → reenvio sem duplicação, concorrência,
migração que preserva dados, tokens separados, falhas de rede, `429`, fila cheia,
reinício e ausência de rede no hook. Não ligam uma aplicação empresarial real
nem enviam dados para a Cloudflare ou Gemini.

Referências do runtime: [HTTP/redirects Python](https://docs.python.org/3/library/urllib.request.html)
e [transações SQLite Python](https://docs.python.org/3/library/sqlite3.html).
