# Configuração do MacroDroid para Talisma

## Visão Geral

O MacroDroid é um app de automação para Android que captura notificações bancárias e as envia automaticamente para o Talisma, criando transações sem necessidade de intervenção manual.

## Pré-requisitos

1. App MacroDroid instalado no celular (Google Play)
2. Conta no Talisma ativa
3. API Key configurada no Talisma

## API Key

```
wO-vkfjg_MOALsMgktNa9sOd2fArD6xGdxCcT21PRGc
```

**Guarde esta chave em local seguro!** Ela é necessária para autenticação.

## Configuração no MacroDroid

### Passo 1: Criar Nova Macro

1. Abra o MacroDroid
2. Toque em "+" para criar nova macro
3. Nomeie: "Talisma - Notificações Bancárias"

### Passo 2: Configurar Trigger (Gatilho)

1. Toque em "Adicionar Trigger"
2. Selecione "Notificação"
3. Selecione "Notificação de aplicação"
4. Selecione o app do banco (ex: "Neon", "Nubank", "Itaú")
5. Opcional: Adicione filtro de texto (ex: "Pix", "Compra", "Transferência")

### Passo 3: Configurar Action (Ação)

1. Toque em "Adicionar Action"
2. Selecione "HTTP Request"
3. Configure:
   - **URL:** `https://talisma.conectagente.online/api/webhooks/macrodroid`
   - **Method:** POST
   - **Headers:**
     - Nome: `X-API-Key`
     - Valor: `wO-vkfjg_MOALsMgktNa9sOd2fArD6xGdxCcT21PRGc`
   - **Body:**
     ```json
     {"text": "%notification_text%"}
     ```
   - **Content Type:** `application/json`

### Passo 4: Testar

1. Salve a macro
2. Aguarde uma notificação do banco
3. Verifique se a transação foi criada no Talisma

## Formatos de Notificação Suportados

### Pix Recebido
```
Pix recebido
Você recebeu um Pix de João Silva CPF *.123.456- no valor de R$ 50,00.
```

### Compra no Cartão
```
Compra aprovada no cartão final 1234
Valor: R$ 150,00
Estabelecimento: Shopping ABC
```

### Transferência
```
Transferência recebida de Maria Santos
Valor: R$ 1.000,00
```

## Solução de Problemas

### Erro 401 (Unauthorized)
- Verifique se a API Key está correta
- Verifique se o header `X-API-Key` está configurado

### Erro 422 (Unprocessable Entity)
- O formato da notificação não foi reconhecido
- Verifique se o texto contém "R$" seguido de valor

### Erro 503 (Service Unavailable)
- A integração MacroDroid não está configurada no servidor
- Verifique se a variável `MACRODROID_API_KEY` está definida

### Transação não aparece no Talisma
- Verifique se a conta "Carteira" existe
- Verifique os logs do backend: `docker compose logs backend`

## Limitações

- Apenas notificações de apps bancários são suportadas
- O parser tenta extrair automaticamente tipo, valor e descrição
- Categorias são atribuídas automaticamente (pode precisar de ajuste manual)
- Conta padrão é "Carteira" (pode ser alterada enviando `account_id`)

## Avançado

### Enviar para Conta Específica

Adicione o campo `account_id` ao body:

```json
{
  "text": "Pix recebido de João no valor de R$ 50,00",
  "account_id": "uuid-da-conta"
}
```

### Obter ID da Conta

```bash
curl -s "http://localhost:8000/api/accounts" \
  -H "Authorization: Bearer SEU_TOKEN"
```

## Segurança

- A API Key é verificada a cada requisição
- Use HTTPS em produção
- Não compartilhe a API Key publicamente
- Revogue a chave se comprometida (altere no .env e reinicie o backend)

## Comandos Úteis

```bash
# Testar endpoint
curl -X POST "https://talisma.conectagente.online/api/webhooks/macrodroid" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_API_KEY" \
  -d '{"text": "Pix recebido de João no valor de R$ 50,00"}'

# Ver logs do backend
docker compose -f docker-compose.prod.yml logs -f backend

# Reiniciar backend
docker compose -f docker-compose.prod.yml restart backend
```
