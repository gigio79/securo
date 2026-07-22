#!/bin/bash
#
# Script standalone para criar débitos de pagamento de cartão na Carteira.
#
# Este script identifica débitos de pagamento gerados por recorrências nos cartões
# (Nubank, InfinitePay, Mercado Pago) e cria o correspondente débito na Carteira
# com categoria "Transferências" (excluído de relatórios de despesas).
#
# Uso:
#   cd /home/giovanni/projetos/talisma && bash scripts/create_cc_payment_counterparts.sh
#
# Ou via cron (executa diariamente às 23:00):
#   0 23 * * * cd /home/giovanni/projetos/talisma && bash scripts/create_cc_payment_counterparts.sh
#

set -euo pipefail

CARTEIRA_ID="6f6baa42-e965-4aa4-b287-4dfb72debf0e"
TRANSFER_CAT_ID="6ffbd314-6caa-4926-9675-75b55927d0f0"

# Contas de cartão pessoal (onde os pagamentos NÃO devem ficar como despesa)
CC_ACCOUNTS="'3c5ef9f5-cd01-4bff-a976-5f76b63dd383', '683ed57a-a912-4ab1-ac21-13600bff44c5', 'e47f327f-8058-451b-a9b9-fdbc39a0c75e'"

run_sql() {
    docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d securo -t -A -c "$1"
}

echo "============================================================"
echo "Verificando pagamentos de cartão sem débito correspondente na Carteira"
echo "============================================================"

# Encontrar transações de pagamento nos cartões pessoais que não têm par na Carteira
ROWS=$(run_sql "
    SELECT t.id || '|' || t.description || '|' || t.amount || '|' || t.date || '|' || t.currency || '|' || t.user_id || '|' || t.workspace_id
    FROM transactions t
    WHERE t.account_id IN (${CC_ACCOUNTS})
      AND t.type = 'debit'
      AND t.source = 'recurring'
      AND NOT EXISTS (
          SELECT 1 FROM transactions t2
          WHERE t2.account_id = '${CARTEIRA_ID}'
            AND t2.category_id = '${TRANSFER_CAT_ID}'
            AND t2.description = t.description
            AND t2.date = t.date
            AND t2.amount = t.amount
      )
    ORDER BY t.date;
")

if [ -z "$ROWS" ]; then
    echo "Nenhum pagamento pendente. Script finalizado."
    exit 0
fi

CREATED=0

while IFS='|' read -r TX_ID DESCRIPTION AMOUNT TX_DATE CURRENCY USER_ID WS_ID; do
    NEW_ID=$(run_sql "SELECT gen_random_uuid();")

    run_sql "
        INSERT INTO transactions (
            id, account_id, category_id, description, amount, date, effective_date,
            type, source, status, currency, user_id, workspace_id, created_at
        ) VALUES (
            '${NEW_ID}', '${CARTEIRA_ID}', '${TRANSFER_CAT_ID}',
            '${DESCRIPTION}', ${AMOUNT}, '${TX_DATE}', '${TX_DATE}',
            'debit', 'transfer', 'posted', '${CURRENCY}',
            '${USER_ID}', '${WS_ID}', NOW()
        );
    "

    echo "  Criado: ${DESCRIPTION} - R\$ ${AMOUNT} (${TX_DATE})"
    CREATED=$((CREATED + 1))

done <<< "$ROWS"

echo ""
echo "============================================================"
echo "Resumo: ${CREATED} débitos criados na Carteira"
echo "============================================================"
