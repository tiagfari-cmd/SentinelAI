# SentinelAI

SentinelAI é uma plataforma educativa de monitorização de segurança que recebe
eventos de autenticação e identifica padrões compatíveis com uma possível
tentativa de força bruta.

**Começar:** segue o [guia de demonstração](docs/demo.md) ou as instruções Docker
abaixo. A [arquitetura](docs/architecture.md) explica o percurso dos dados e a
[roadmap](docs/roadmap.md) distingue as funcionalidades atuais das que ainda
faltam antes de produção.

**Experimentar no browser:** [demo pública gratuita](https://sentinelai-demo.tiagfari.workers.dev/).
Não exige conta ou instalação; usa dados fictícios e respostas locais, não um LLM.
Para analisar eventos próprios, executa a instalação completa no teu computador:

```powershell
git clone https://github.com/tiagfari-cmd/SentinelAI.git
cd SentinelAI
docker compose up --build -d
```

Requer Git e Docker Desktop em execução. Abre `http://localhost:8080`;
envia os teus eventos através de `http://localhost:8001/docs`. Não há recolha
automática de logs. A configuração padrão usa SQLite persistente e assistente
mock, sem chave de API. Não exponhas esta instalação local na Internet.

Consulta também a [política de segurança](SECURITY.md): um repo público permite
ver e usar o código, mas não concede acesso de escrita ao projeto original.

> Um alerta indica atividade suspeita que merece investigação. Não prova que
> ocorreu um ataque.

## Gratuito e open-source

O código está disponível sob a licença MIT para estudar, usar e executar no teu
computador. Esta versão não inclui pagamentos, subscrições ou funcionalidades
premium. Uma eventual versão SaaS será uma decisão futura, não um requisito para
usar este projeto. Hospedagem e provedores LLM podem ter custos ou quotas próprios;
o modo mock não necessita de uma chave nem faz chamadas externas.

### Demo pública, sem expor a API

Existe um build específico para um site público: `npm run build:demo` na pasta
`frontend`. Usa exclusivamente dados fictícios e um assistente local com
respostas pré-definidas, sem chamadas ao backend ou ao Gemini. Inclui acesso às
instruções de instalação gratuita. Consulta o [guia de publicação](docs/public-demo.md)
para configuração Cloudflare, validação e limitações. A demo está publicada
em [sentinelai-demo.tiagfari.workers.dev](https://sentinelai-demo.tiagfari.workers.dev/);
a API completa continua local.

No PowerShell, se `npm.ps1` ou `npx.ps1` estiverem bloqueados, usa os executáveis
`npm.cmd` e `npx.cmd` nos comandos abaixo. Não é necessário alterar a política
de execução do Windows.

## Estado atual

Concluído na Fase 1:

- leitura de eventos a partir de JSON;
- validação dos campos obrigatórios;
- suporte para eventos fora de ordem cronológica;
- deteção de 5 ou mais falhas do mesmo IP em qualquer janela de 60 segundos;
- supressão de alertas repetidos para a mesma sequência;
- testes automáticos com a biblioteca padrão do Python.

Concluída na Fase 2: API REST com FastAPI. A API recebe e lista eventos e
calcula alertas.

Concluída na Fase 3: persistência com SQLAlchemy, PostgreSQL compatível e
migrações Alembic. SQLite é usado por omissão para simplificar a execução local;
PostgreSQL pode ser selecionado através de `DATABASE_URL`.

Concluída na Fase 4: dashboard React/TypeScript, visualização dos eventos da
API, filtros, exportação JSON, detalhe de alertas e assistente ligado ao
backend. O assistente usa respostas mockadas por omissão; Gemini é opcional.

Fase 5: o backend envia só contagens agregadas e a pergunta do operador; formatos
comuns de IP, email e credenciais são mascarados antes do pedido Gemini. A redação
é de melhor esforço e a pergunta continua a ser partilhada com o fornecedor quando
Gemini está ativo — não incluas dados confidenciais.

Fase 6: testes, validação, token partilhado, limites básicos de tráfego e de tamanho,
paginação, auditoria de dependências, CI e Docker estão implementados para o
protótipo. Ainda não existe autenticação individual, limitação distribuída nem
configuração de alojamento de produção. A Fase 7 inclui agora
arquitetura, guião de demonstração e uma
[captura real do dashboard](docs/images/dashboard.jpg) que mostra a versão
responsiva com a amostra fictícia. A demo estática foi publicada e validada em
13 de outubro de 2026, com HTTPS e headers restritivos. Isto não constitui
validação de um serviço de monitorização multiutilizador em produção.

Proteção inicial: os endpoints de eventos, alertas e assistente aceitam um
Bearer token opcional em desenvolvimento e exigem-no em produção. O dashboard
tem um ecrã de acesso e mantém o token só na memória da página.

## Processo de desenvolvimento

O SentinelAI está a ser construído por marcos pequenos. Cada marco deve ter um
objetivo claro, documentação, testes e uma forma simples de verificar o
resultado antes de avançarmos para tecnologias novas. Assim, o projeto cresce
sem esconder decisões importantes atrás de ferramentas que ainda não são
necessárias.

Na Fase 1 começámos pelo problema de deteção, sem servidor nem base de dados.
Usámos apenas a biblioteca padrão do Python para que o programa seja fácil de
instalar e para manter o foco na validação dos dados e no algoritmo. Os eventos
de exemplo são fictícios e usam endereços reservados para documentação.

O percurso de um evento é:

```text
ficheiro JSON → validação → ordenação por IP e hora → janela de 60 segundos
                                                    ↓
                                       alerta com evidência observada
```

Os testes cobrem casos normais e limites: eventos fora de ordem, cinco falhas
no intervalo, falhas demasiado afastadas, logins bem-sucedidos, IPs distintos,
dados inválidos e supressão de duplicados. Um teste que falhou durante o
desenvolvimento ajudou-nos a corrigir a forma de representar exatamente o
instante dos 60 segundos; a verificação final passou nos 10 testes.

O motor da Fase 1 foi publicado na branch `feature/phase-1-detection`. A API da
Fase 2 foi publicada na branch `feature/phase-2-rest-api`. A Fase 3 está na
branch `feature/phase-3-database`. A Fase 4 está publicada em
`feature/phase-4-dashboard`, baseada na Fase 3.

O GitHub Actions executa os testes do backend, verifica build e lint do frontend
e os testes de separação entre demo pública e instalação completa,
constrói as imagens Docker e audita dependências Python e JavaScript em cada push
e pull request. A auditoria de dependências também corre semanalmente para detetar
avisos publicados depois de uma alteração ao código. O workflow só tem permissão
de leitura e não usa segredos nem faz deploy automático. O CI constrói também o
artefacto público separado, sem configurar credenciais de alojamento.

Na Fase 2, acrescentámos endpoints HTTP e validação de pedidos com
Pydantic. Na Fase 3, os eventos e alertas passaram a ser guardados em tabelas;
uma sessão de base de dados gere as operações de cada pedido, e Alembic aplica
alterações ao esquema através de migrações versionadas. Na Fase 4, o frontend
consulta a API e apresenta uma amostra fictícia quando a API local não está
disponível. O assistente pode usar Gemini se for explicitamente ativado no
backend; envia contagens agregadas e a pergunta depois de mascarar formatos
comuns de IP, email e credenciais. Não envia os eventos brutos.

### Decisões técnicas

- **Python padrão:** não há dependências para instalar nem configurar.
- **UTC e fuso horário obrigatório:** eventos de fusos diferentes podem ser
  comparados corretamente; datas ambíguas sem fuso são rejeitadas.
- **Endereço IP validado:** formatos inválidos não entram na regra.
- **Ordenação antes da deteção:** a ordem do ficheiro não altera o resultado.
- **Alerta baseado em evidência:** o resultado descreve falhas observadas e não
  classifica o evento como ataque confirmado.
- **IA separada da deteção:** a regra continua determinística; a IA é opcional,
  corre só no backend e recebe apenas métricas agregadas.
- **Base de dados substituível:** SQLAlchemy evita prender a lógica da aplicação
  a SQLite ou PostgreSQL.
- **Migrações versionadas:** Alembic altera o esquema sem apagar dados como
  parte normal da evolução da aplicação.
- **Testes isolados:** cada teste da API usa SQLite em memória e não depende de
  uma instalação local de PostgreSQL.
- **Chave de LLM só no servidor:** um futuro chatbot deve chamar o provedor a
  partir do backend; uma chave colocada no JavaScript do browser ficaria visível.

Quando uma fase terminar, este README deve indicar o que foi implementado, como
executar e testar, que decisões foram tomadas e que limitações continuam em
aberto. O histórico de Git regista as alterações; a documentação explica o
motivo e o funcionamento delas.

## Estrutura

```text
backend/
├── app/
│   ├── __init__.py       # identifica a pasta como um pacote Python
│   ├── api.py            # endpoints HTTP da API
│   ├── database.py       # ligação e sessões SQLAlchemy
│   ├── detection.py      # valida eventos e aplica a regra de deteção
│   ├── main.py           # programa da Fase 1 executado na linha de comandos
│   ├── models.py         # tabelas de eventos e alertas
│   ├── repositories.py   # operações de leitura e escrita na base de dados
│   └── schemas.py        # validação e formato dos dados da API
└── tests/
    ├── test_api.py       # testes dos pedidos HTTP
    └── test_detection.py # testes automáticos do motor
data/
└── sample_logs.json      # eventos fictícios para demonstração
requirements.txt          # dependências necessárias para a API
alembic.ini               # configuração das migrações
migrations/               # histórico de alterações às tabelas
docs/                     # arquitetura, roadmap e guião da demonstração
scripts/                  # utilitários PowerShell para dados fictícios
.env.example              # exemplo de configuração sem credenciais reais
frontend/                 # interface React, TypeScript, Tailwind e Recharts
.github/workflows/        # testes e verificações em cada push/PR
Dockerfile                # imagem da API Python
docker-compose.yml        # API, dashboard e volume SQLite local
```

## Requisitos

- Python 3.11 ou mais recente.
- Node.js 24 ou mais recente para o frontend.
- Docker Desktop com Docker Compose para executar os serviços em containers.
- Para a Fase 1 não são necessárias dependências externas.
- Para a API e base de dados, instalar as dependências listadas em `requirements.txt`.

## Executar no Windows

Abra o PowerShell na raiz do projeto e execute:

```powershell
py -m backend.app.main data\sample_logs.json
```

Depois de instalar as dependências no ambiente virtual, executar todos os testes:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

### Iniciar a API REST

Criar um ambiente virtual, instalar as dependências e preparar a base SQLite:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\alembic.exe upgrade head
```

Iniciar o servidor local usando o Python do ambiente virtual:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.api:app --reload
```

Com o servidor em execução, abrir `http://127.0.0.1:8000/docs` para experimentar
os endpoints interativamente. `Ctrl+C` pára o servidor. A base SQLite fica no
ficheiro `sentinelai.db` e mantém os eventos depois de reiniciar a API. Não é
necessário ativar o ambiente virtual; assim evitamos depender da política de
execução de scripts do PowerShell.

Para usar PostgreSQL, cria primeiro uma base de dados local e define a URL antes
de executar a migração e iniciar a API:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://sentinelai:password@localhost:5432/sentinelai"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.app.api:app --reload
```

Substitui `password` pelas credenciais locais. Não guardes credenciais reais no
Git. `.env.example` é apenas uma referência; o PowerShell não carrega ficheiros
`.env` automaticamente.

Também é possível enviar um evento a partir de outro terminal PowerShell:

```powershell
$evento = @{
  timestamp = "2026-10-12T09:00:00Z"
  ip_address = "203.0.113.42"
  username = "ana"
  outcome = "failed"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/events" `
  -ContentType "application/json" `
  -Body $evento
```

Os pedidos `POST /events` guardam o evento e qualquer novo alerta detetado na
base de dados. Uma chave única evita guardar repetidamente a mesma sequência.
Em desenvolvimento local, o token é opcional. Antes de exposição pública,
configura `APP_ENV=production` e um `SENTINELAI_API_TOKEN` forte no ambiente do
servidor; este token partilhado continua a ser apenas uma proteção de demonstração.

### Endpoints disponíveis

| Método | Caminho | Resultado |
| --- | --- | --- |
| `GET` | `/health` | Confirma que a API responde. |
| `GET` | `/auth/check` | Valida o token de acesso ao dashboard. |
| `GET` | `/events` | Lista uma página de eventos; total no header `X-Total-Count`. |
| `POST` | `/events` | Valida e guarda um evento; responde com `201 Created`. |
| `GET` | `/alerts` | Lista uma página de alertas, incluindo a hora da deteção. |
| `POST` | `/assistant` | Responde em modo mock ou, se configurado, via Gemini. |

Um pedido com campos inválidos recebe `422 Unprocessable Entity`, com detalhes
sobre os campos que falharam a validação.

### Paginação e limites básicos

`GET /events` e `GET /alerts` aceitam `limit` (1–500, omissão 100), `offset`
(0–100000) e `order` (`asc` por omissão ou `desc`). Exemplo:
`GET /events?limit=50&offset=50&order=desc`. O header `X-Total-Count` indica o
total de registos. O dashboard carrega no máximo 500 eventos e 500 alertas mais
recentes; avisa quando a vista é parcial. Indicadores, filtros e exportação
referem-se aos registos carregados, não a todo o histórico.

Pedidos HTTP têm um limite de corpo de 8192 bytes, verificado também para envios
em partes sem `Content-Length`; excessos recebem `413`. O nome de utilizador tem
no máximo 255 caracteres. Por janela móvel de 60 segundos, todos os operadores
partilham os seguintes limites por processo: 300 pedidos no total, 120 leituras,
60 escritas, 20 verificações de acesso e 10 pedidos ao assistente. Pedidos
recusados recebem `429` e `Retry-After`; `/health` e preflights CORS não consomem
o orçamento. Pedidos inválidos e tentativas de autenticação também contam.

Estes limites são de demonstração, não proteção contra DDoS: reiniciam com o
processo e não são partilhados por múltiplos workers/réplicas. Um utilizador pode
esgotar temporariamente o orçamento de outros. Antes de publicação, configura
limitação partilhada no ponto de entrada, limites por utilizador autenticado,
timeouts e restrições de rede. Headers enviados pelo cliente não alteram os
orçamentos da aplicação.

## Formato dos eventos

Cada evento é um objeto JSON com quatro campos obrigatórios:

```json
{
  "timestamp": "2026-10-12T09:00:00Z",
  "ip_address": "203.0.113.42",
  "username": "ana",
  "outcome": "failed"
}
```

- `timestamp`: data e hora no formato ISO 8601, com fuso horário;
- `ip_address`: endereço IPv4 ou IPv6 válido;
- `username`: nome de utilizador não vazio;
- `outcome`: `failed` ou `success`.

## Como funciona a deteção

1. Os eventos válidos são agrupados por endereço IP.
2. As falhas de cada IP são ordenadas por data, por isso o JSON pode estar fora
   de ordem.
3. Uma fila guarda apenas as falhas ocorridas nos últimos 60 segundos.
4. Quando a fila atinge 5 falhas, é criado um alerta.
5. Enquanto a mesma sequência continuar acima do limite, não são criados
   alertas duplicados. Se a atividade baixar do limite e voltar a atingi-lo,
   pode ser criado um novo alerta.

O algoritmo é determinístico: os mesmos eventos produzem sempre o mesmo
resultado. A complexidade principal é aproximadamente O(n log n), devido à
ordenação cronológica.

## Dashboard (Fase 4)

O dashboard está em `frontend/`. Mostra indicadores calculados a partir dos
eventos e alertas devolvidos pela API, permite pesquisar e filtrar eventos,
exportar os eventos apresentados para JSON e abrir detalhes de um alerta. Se a
API não estiver disponível, apresenta uma pequena amostra de dados fictícios e
identifica-a claramente. O assistente usa respostas de demonstração por
omissão; pode usar Gemini no backend, enviando ao modelo apenas contagens
agregadas de eventos e alertas, além da pergunta do operador depois de mascarar
formatos comuns de IP, email e credenciais. A pergunta pode conter informação que
o filtro não reconhece: não introduzas dados confidenciais.

Numa janela PowerShell, inicia a API seguindo as instruções acima. Noutra,
instala as dependências e inicia o dashboard:

```powershell
cd frontend
npm install
npm run dev
```

Abre o endereço local indicado pelo Vite (normalmente `http://localhost:5173`).
Para criar a versão estática e verificar os tipos TypeScript:

```powershell
npm run build
```

### Executar com Docker Compose

Docker Compose inicia a API e o dashboard sem ser necessário instalar as
dependências Python e Node diretamente no computador. No Windows, instala e
inicia o Docker Desktop primeiro. Depois, a partir da pasta principal do repo,
cria `.env` a partir do exemplo apenas se ainda não existir:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Para usar Gemini, edita `.env` e define `ASSISTANT_PROVIDER=gemini` e
`GEMINI_API_KEY` com a chave no teu computador. Não partilhes nem commits esse
ficheiro. De seguida, constrói e inicia os serviços:

```powershell
docker compose up --build
```

Abre `http://localhost:8080` para o dashboard e `http://localhost:8001/docs`
para a documentação da API. O mapeamento `8001:8000` evita conflito com uma API
de desenvolvimento que já esteja a usar a porta local `8000`. O dashboard
encaminha os pedidos da API pelo próprio servidor web; os serviços só ficam
acessíveis a partir do computador local. A base de dados SQLite fica num volume
Docker e as migrações são aplicadas no arranque da API. `docker compose down`
pára os serviços sem apagar os dados; `docker compose down -v` também apaga o
volume e todos os dados locais.

O browser só permite chamadas locais à API na origem de desenvolvimento do
Vite. Para outro domínio, configura `CORS_ALLOWED_ORIGINS` no backend com uma
lista separada por vírgulas de origens explicitamente permitidas. CORS não é
autenticação nem substitui proteger uma API pública.

### Proteção da API

Em desenvolvimento local, a API não exige token por omissão. Antes de qualquer
exposição pública, define `APP_ENV=production` e guarda um token aleatório,
forte e privado em `SENTINELAI_API_TOKEN` no gestor de segredos do serviço de
hospedagem. Em produção, a API falha de forma segura e recusa pedidos protegidos
se esse segredo não estiver configurado. `/health` permanece público para os
controlos de saúde do alojamento.

O dashboard pede o token ao operador quando necessário, envia-o como Bearer e
mantém-no só na memória da página (não usa localStorage). Usa HTTPS e restringe
`CORS_ALLOWED_ORIGINS` ao domínio do dashboard. Este mecanismo é uma proteção
simples para uma demonstração privada com poucos operadores, não substitui
autenticação de utilizadores, limitação de pedidos ou monitorização numa
instalação pública de produção.

### Auditoria de dependências

O CI usa `pip-audit` para comparar as dependências Python declaradas com avisos
de vulnerabilidades conhecidos e `npm audit` para as dependências JavaScript do
ficheiro de lock. Uma falha na auditoria requer rever o aviso e atualizar ou
substituir a dependência afetada. Estes relatórios ajudam a encontrar problemas
conhecidos, mas não provam que o código ou as dependências estão livres de
vulnerabilidades.

### Assistente opcional Gemini

Por omissão, `POST /assistant` responde sem chamadas externas. Para ativar o
provedor, define `ASSISTANT_PROVIDER=gemini`, guarda `GEMINI_API_KEY` como
variável de ambiente **no backend** e, opcionalmente, escolhe `GEMINI_MODEL`.
O frontend nunca recebe a chave. O pedido ao provedor contém a pergunta (após
redação de melhor esforço) e apenas o total de eventos e alertas — não inclui a
tabela de eventos. O filtro mascara IPs, emails e padrões comuns de credenciais,
mas não reconhece todo o tipo de informação pessoal; nunca introduzas dados reais
ou confidenciais. O modo mock continua disponível sem chave.

```powershell
$env:ASSISTANT_PROVIDER = "gemini"
$env:GEMINI_API_KEY = "a-tua-chave-local"
.\.venv\Scripts\python.exe -m uvicorn backend.app.api:app --reload
```

Não coloques a chave num ficheiro versionado, numa variável `VITE_*` ou em
mensagens públicas. Antes de ativar Gemini com dados operacionais, revê os
termos do provedor e as regras de privacidade aplicáveis.

## Limitações conhecidas

- O Docker Compose é apenas para execução local; ainda não há configuração de ambiente de produção.
- A proteção usa um token de operador partilhado; ainda faltam contas individuais,
  limitação distribuída e monitorização adequadas a uma API pública. As auditorias
  automáticas só detetam vulnerabilidades conhecidas nas dependências.
- A regra considera apenas falhas por IP, sem contexto adicional.
- Não existe confirmação automática de ataque nem resposta automática.
- A API pagina respostas, mas ainda não limita o total de eventos guardados.
  A ingestão recalcula a deteção sobre o histórico; faltam retenção, ingestão
  incremental e testes de carga para datasets grandes.
- A redação do texto enviado ao Gemini é de melhor esforço, não uma garantia de
  anonimização. A integração real depende de uma chave configurada pelo operador.

## Próximos marcos

1. Acrescentar autenticação individual, limites distribuídos e monitorização antes
   de expor a API publicamente.
2. Configurar hospedagem, domínio, base de dados gerida e segredos de produção.
3. Ligar uma chave Gemini ao ambiente do servidor, se desejado; o modo mock é
   o comportamento padrão e não depende de chave.

Para preencher o dashboard local com a amostra fictícia sem substituir dados já
existentes, usa o script que verifica primeiro se a base está vazia:

```powershell
.\scripts\load_demo_data.ps1
```

O script ignora o registo inválido incluído na amostra para testar o motor da
Fase 1. Para parar os containers sem apagar a base de dados, executa
`docker compose down`.

