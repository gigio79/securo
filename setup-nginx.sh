#!/bin/bash
set -e

# 1. Criar config Nginx
cat > /etc/nginx/sites-available/talisma.conf << 'NGINX'
server {
    listen 80;
    server_name talisma.online;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name talisma.online;
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# 2. Ativar
ln -sf /etc/nginx/sites-available/talisma.conf /etc/nginx/sites-enabled/talisma.conf

# 3. Testar e recarregar
nginx -t && systemctl reload nginx

echo "✅ Nginx configurado para talisma.online"
