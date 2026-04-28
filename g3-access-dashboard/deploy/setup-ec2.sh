#!/usr/bin/env bash
# G3 Access dashboard + scanner — EC2 / Ubuntu 22.04+ setup script.
#
# Run as root (or with sudo). Idempotent; safe to re-run.
# Assumes Ubuntu/Debian APT-based AMI. For Amazon Linux, translate
# apt commands to dnf/yum; Playwright libs are named differently on AL2.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/g3-access-dashboard}"
SCANNER_DIR="${SCANNER_DIR:-/var/www/g3-access-scanner}"
APP_USER="${APP_USER:-www-data}"

echo "==> [1/7] Updating package index"
apt-get update -y

echo "==> [2/7] Installing PHP 8.3 + extensions + composer + nginx + pandoc"
apt-get install -y software-properties-common curl unzip git supervisor nginx pandoc
add-apt-repository -y ppa:ondrej/php
apt-get update -y
apt-get install -y php8.3 php8.3-cli php8.3-fpm php8.3-mysql php8.3-sqlite3 \
    php8.3-mbstring php8.3-xml php8.3-curl php8.3-bcmath php8.3-zip php8.3-gd \
    php8.3-intl
if ! command -v composer >/dev/null 2>&1; then
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
fi

echo "==> [3/7] Installing Node 20 LTS"
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node --version

echo "==> [4/7] Installing MySQL (skip if already installed, or using RDS)"
if ! command -v mysql >/dev/null 2>&1; then
    apt-get install -y mysql-server
fi

echo "==> [5/7] Preparing app directories"
mkdir -p "$APP_DIR" "$SCANNER_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$SCANNER_DIR"

echo "==> [6/7] Installing Playwright Chromium + system deps (for scanner)"
if [ -d "$SCANNER_DIR/node_modules" ]; then
    cd "$SCANNER_DIR"
    sudo -u "$APP_USER" npx playwright install chromium --with-deps
else
    echo "NOTE: Scanner not yet installed at $SCANNER_DIR. Run this command after deploying:"
    echo "  cd $SCANNER_DIR && sudo -u $APP_USER npm ci && sudo -u $APP_USER npm run build && sudo -u $APP_USER npx playwright install chromium --with-deps"
fi

echo "==> [7/7] Installing supervisor + cron config"
if [ -f "$APP_DIR/deploy/supervisor/g3-access-worker.conf" ]; then
    cp "$APP_DIR/deploy/supervisor/g3-access-worker.conf" /etc/supervisor/conf.d/
    supervisorctl reread
    supervisorctl update
fi
if [ -f "$APP_DIR/deploy/cron/g3-access-scheduler" ]; then
    cp "$APP_DIR/deploy/cron/g3-access-scheduler" /etc/cron.d/g3-access-scheduler
    chmod 0644 /etc/cron.d/g3-access-scheduler
fi

echo ""
echo "==> Setup complete. Remaining manual steps:"
echo "  1. cd $APP_DIR && composer install --no-dev --optimize-autoloader"
echo "  2. cp .env.example .env && edit .env (DB credentials, SCANNER_CLI_PATH, APP_KEY)"
echo "  3. php artisan key:generate"
echo "  4. php artisan migrate --force"
echo "  5. Configure nginx/php-fpm to serve $APP_DIR/public (see deploy/nginx/)"
echo "  6. sudo systemctl restart nginx php8.3-fpm supervisor cron"
echo "  7. Verify: sudo supervisorctl status g3-access-worker:*"
