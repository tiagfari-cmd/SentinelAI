# Demonstração do SentinelAI

## Preparação

1. Instala e abre Docker Desktop.
2. Na raiz do repositório, inicia os serviços:

   ```powershell
   docker compose up --build -d
   ```

3. Abre `http://localhost:8080` para o dashboard e
   `http://localhost:8001/docs` para a API.

## Carregar amostra fictícia

O script abaixo só escreve na base de dados se `GET /events` estiver vazio. Lê
`data/sample_logs.json`, envia os eventos válidos e ignora o registo inválido
incluído para demonstrar validação. Endereços IP e nomes da amostra são
fictícios. Executa na raiz do repositório:

```powershell
.\scripts\load_demo_data.ps1
```

Se a API estiver configurada com token, define primeiro
`$env:SENTINELAI_API_TOKEN` nesta janela PowerShell. O script não apaga nem
substitui eventos existentes.

## Guião de 3 minutos

1. Na visão geral, explica o total de eventos e alertas e confirma que a origem
   mostrada é a API, não os dados de fallback.
2. Abre **Alertas** e seleciona o alerta do IP fictício
   `203.0.113.42`. Mostra as cinco falhas e o intervalo observado.
3. Explica que a regra agrega falhas por IP numa janela móvel de 60 segundos e
   que o alerta é evidência para investigar, não confirmação de um ataque.
4. Abre **Eventos**, filtra por falhas e pesquisa o IP. Usa **Exportar** para
   mostrar a exportação JSON.
5. Abre o assistente. No modo mock, não há pedido externo. Para demonstrar
   Gemini, configura a chave só no backend, avisa que a pergunta é enviada ao
   fornecedor após redação de melhor esforço e não introduzas dados reais.
6. Fecha mostrando os testes, o diagrama e as limitações documentadas.

## Captura de ecrã

Para a imagem do README, inicia a aplicação com a base de dados vazia ou com a
amostra carregada, abre o dashboard num browser a 1440 px ou mais, e guarda uma
captura em `docs/images/dashboard.png`. Usa apenas os dados fictícios do projeto;
não incluas tokens, emails reais nem registos operacionais.
