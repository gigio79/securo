#!/bin/bash
# Script para copiar arquivos modificados para o container do backend
# Uso: bash scripts/deploy-backend.sh

set -e

echo "Copiando arquivos para o container securo-backend-1..."

docker cp backend/app/api/macrodroid_webhook.py securo-backend-1:/app/app/api/macrodroid_webhook.py
docker cp backend/app/main.py securo-backend-1:/app/app/main.py
docker cp backend/app/core/config.py securo-backend-1:/app/app/core/config.py

echo "Reiniciando backend..."
docker restart securo-backend-1

echo "Aguardando backend iniciar..."
sleep 10

echo "Testando endpoint..."
curl -s -X POST "http://localhost:8000/api/webhooks/macrodroid" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wO-vkfjg_MOALsMgktNa9sOd2fArD6xGdxCcT21PRGc" \
  -d '{"text": "Teste de conexão"}' | head -c 200

echo ""
echo "Deploy concluído!"
