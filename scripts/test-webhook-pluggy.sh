#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"

echo "=== Testando Webhook Pluggy ==="
echo "URL: $BASE_URL/api/webhooks/pluggy"
echo ""

# Test 1: item/created
echo "--- Test 1: item/created ---"
curl -s -X POST "$BASE_URL/api/webhooks/pluggy" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "item/created",
    "eventId": "d876fd7c-e9bd-4c4c-bd46-cc96c62aac29",
    "itemId": "a5c763cb-0952-457b-9936-630f79c5b016",
    "triggeredBy": "USER",
    "clientUserId": "client-user-id"
  }' | python3 -m json.tool
echo ""

# Test 2: item/updated
echo "--- Test 2: item/updated ---"
curl -s -X POST "$BASE_URL/api/webhooks/pluggy" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "item/updated",
    "eventId": "d876fd7c-e9bd-4c4c-bd46-cc96c62aac30",
    "itemId": "a5c763cb-0952-457b-9936-630f79c5b016",
    "triggeredBy": "SYNC",
    "clientUserId": "client-user-id"
  }' | python3 -m json.tool
echo ""

# Test 3: transactions/created
echo "--- Test 3: transactions/created ---"
curl -s -X POST "$BASE_URL/api/webhooks/pluggy" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "transactions/created",
    "eventId": "4e69d62d-b7c8-4f01-b591-a1d8a94710b9",
    "itemId": "de7bbf5a-abf2-47e4-94b1-586b36758423",
    "accountId": "0d5a0de2-9c82-4ea2-af50-31643a632a33",
    "transactionsCount": 332,
    "transactionsMinDate": "2025-02-12T15:00:01.000Z",
    "transactionsCreatedAtFrom": "2025-02-13T17:21:53.719Z",
    "createdTransactionsLink": "https://api.pluggy.ai/transactions?accountId=0d5a0de2-9c82-4ea2-af50-31643a632a33&createdAtFrom=2025-02-13T17:21:53.719Z"
  }' | python3 -m json.tool
echo ""

# Test 4: transactions/updated
echo "--- Test 4: transactions/updated ---"
curl -s -X POST "$BASE_URL/api/webhooks/pluggy" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "transactions/updated",
    "eventId": "d876fd7c-e9bd-4c4c-bd46-cc96c62aac31",
    "itemId": "a5c763cb-0952-457b-9936-630f79c5b016",
    "accountId": "8a6e2c17-2817-40bb-b03d-546febc6a60a",
    "transactionIds": ["5a14feae-eaa7-423a-820c-6b83837c35b7", "786c7d98-6085-4879-9c7f-2255260e2436"]
  }' | python3 -m json.tool
echo ""

# Test 5: transactions/deleted
echo "--- Test 5: transactions/deleted ---"
curl -s -X POST "$BASE_URL/api/webhooks/pluggy" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "transactions/deleted",
    "eventId": "d876fd7c-e9bd-4c4c-bd46-cc96c62aac32",
    "itemId": "a5c763cb-0952-457b-9936-630f79c5b016",
    "accountId": "8a6e2c17-2817-40bb-b03d-546febc6a60a",
    "transactionIds": ["5a14feae-eaa7-423a-820c-6b83837c35b7"]
  }' | python3 -m json.tool
echo ""

echo "=== Todos os testes concluidos ==="
