export function demoReply(prompt: string): string {
  const question = prompt.toLowerCase()
  if (question.includes('203.0.113.42') || question.includes('alerta')) {
    return 'A amostra fictícia mostra cinco falhas do mesmo IP em 36 segundos. Confirma os registos na origem, verifica se a pessoa reconhece a atividade e procura autenticações bem-sucedidas próximas. É um sinal para investigar, não uma confirmação de ataque.'
  }
  if (question.includes('passo') || question.includes('investig')) {
    return 'Sugestão de investigação: (1) validar timestamps e origem dos registos; (2) procurar autenticações bem-sucedidas próximas das falhas; (3) confirmar com a pessoa responsável se reconhece o acesso. Não tomes medidas automáticas só com base num alerta.'
  }
  if (question.includes('grat') || question.includes('instal')) {
    return 'O SentinelAI é gratuito e open-source (MIT). Segue o README no GitHub para executar a versão completa com Docker no teu computador. Esta demo não recebe logs reais nem necessita de uma chave de API.'
  }
  return 'Esta é uma resposta local pré-definida, não gerada por um LLM. Podes perguntar sobre os alertas, passos de investigação ou instalação. A demo usa apenas dados fictícios e não envia a tua pergunta a um servidor.'
}
