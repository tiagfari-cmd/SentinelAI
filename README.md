# SentinelAI

SentinelAI é um projeto educativo de monitorização de segurança. Nesta primeira
fase, lê eventos de autenticação fictícios e identifica padrões compatíveis com
uma possível tentativa de força bruta.

> Um alerta indica atividade suspeita que merece investigação. Não prova que
> ocorreu um ataque.

## Estado atual

Concluído na Fase 1:

- leitura de eventos a partir de JSON;
- validação dos campos obrigatórios;
- suporte para eventos fora de ordem cronológica;
- deteção de 5 ou mais falhas do mesmo IP em qualquer janela de 60 segundos;
- supressão de alertas repetidos para a mesma sequência;
- testes automáticos com a biblioteca padrão do Python.

Concluída localmente na Fase 2: API REST com FastAPI. A API recebe e lista
eventos, e calcula alertas. Os eventos ficam apenas na memória e desaparecem
quando o servidor é reiniciado.

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
Fase 2 está a ser preparada na branch `feature/phase-2-rest-api`; depois da
revisão, o próximo passo é abrir uma pull request antes de integrar as alterações
na branch principal.

Na Fase 2, acrescentámos quatro endpoints HTTP e validação de pedidos com
Pydantic. Os testes fazem pedidos à aplicação sem iniciar um servidor de rede.
Até agora, os 16 testes das duas fases passam em conjunto.

### Decisões técnicas

- **Python padrão:** não há dependências para instalar nem configurar.
- **UTC e fuso horário obrigatório:** eventos de fusos diferentes podem ser
  comparados corretamente; datas ambíguas sem fuso são rejeitadas.
- **Endereço IP validado:** formatos inválidos não entram na regra.
- **Ordenação antes da deteção:** a ordem do ficheiro não altera o resultado.
- **Alerta baseado em evidência:** o resultado descreve falhas observadas e não
  classifica o evento como ataque confirmado.
- **IA fica para mais tarde:** a regra de deteção é determinística e continuará
  separada de qualquer explicação gerada por um modelo.
- **API sem base de dados nesta fase:** uma lista em memória deixa-nos aprender
  pedidos HTTP sem misturar já esse tema com PostgreSQL.

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
│   ├── detection.py      # valida eventos e aplica a regra de deteção
│   ├── main.py           # programa da Fase 1 executado na linha de comandos
│   └── schemas.py        # validação e formato dos dados da API
└── tests/
    ├── test_api.py       # testes dos pedidos HTTP
    └── test_detection.py # testes automáticos do motor
data/
└── sample_logs.json      # eventos fictícios para demonstração
requirements.txt          # dependências necessárias para a API
```

## Requisitos

- Python 3.11 ou mais recente.
- Para a Fase 1 não são necessárias dependências externas.
- Para a API, instalar as dependências listadas em `requirements.txt`.

## Executar no Windows

Abra o PowerShell na raiz do projeto e execute:

```powershell
py -m backend.app.main data\sample_logs.json
```

Para executar os testes:

```powershell
py -m unittest discover -s backend\tests -v
```

### Iniciar a API REST

Criar um ambiente virtual e instalar as dependências:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
```

Iniciar o servidor local:

```powershell
py -m uvicorn backend.app.api:app --reload
```

Com o servidor em execução, abrir `http://127.0.0.1:8000/docs` para experimentar
os endpoints interativamente. `Ctrl+C` pára o servidor. Se o PowerShell impedir
a ativação do ambiente virtual, também é possível executar o Python diretamente:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app.api:app --reload
```

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

Os pedidos `POST /events` acrescentam eventos só à memória do processo. Esta
versão é adequada para aprendizagem e demonstração local, não para guardar dados
de forma permanente.

### Endpoints disponíveis

| Método | Caminho | Resultado |
| --- | --- | --- |
| `GET` | `/health` | Confirma que a API responde. |
| `GET` | `/events` | Lista os eventos recebidos, por ordem cronológica. |
| `POST` | `/events` | Valida e guarda um evento; responde com `201 Created`. |
| `GET` | `/alerts` | Calcula alertas a partir dos eventos em memória. |

Um pedido com campos inválidos recebe `422 Unprocessable Entity`, com detalhes
sobre os campos que falharam a validação.

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

## Limitações conhecidas

- Os dados existem apenas em ficheiros; ainda não há persistência.
- A regra considera apenas falhas por IP, sem contexto adicional.
- Não existe confirmação automática de ataque nem resposta automática.

## Próximos marcos

1. Rever a API REST da Fase 2 e integrar a pull request.
2. Adicionar PostgreSQL e migrações.
3. Construir o dashboard React.
4. Acrescentar explicações de IA separadas da deteção determinística.

