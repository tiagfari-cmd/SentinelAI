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

Ainda não inclui API, base de dados, frontend, Docker ou integração com IA.

## Estrutura

```text
backend/
├── app/
│   ├── __init__.py       # identifica a pasta como um pacote Python
│   ├── detection.py      # valida eventos e aplica a regra de deteção
│   └── main.py           # programa executado na linha de comandos
└── tests/
    └── test_detection.py # testes automáticos do motor
data/
└── sample_logs.json      # eventos fictícios para demonstração
```

## Requisitos

- Python 3.11 ou mais recente.
- Não são necessárias dependências externas.

## Executar no Windows

Abra o PowerShell na raiz do projeto e execute:

```powershell
py -m backend.app.main data\sample_logs.json
```

Para executar os testes:

```powershell
py -m unittest discover -s backend\tests -v
```

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

1. Afinar o modelo de eventos e acrescentar mais casos de teste.
2. Criar uma API REST pequena com FastAPI.
3. Adicionar PostgreSQL e migrações.
4. Construir o dashboard React.
5. Acrescentar explicações de IA separadas da deteção determinística.

