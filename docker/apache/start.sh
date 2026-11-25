#!/bin/sh
# Starts Apache with KoobD's https certificate in place (docker/apache/koobd-ssl.conf).
#
# The first start makes a "KoobD Local" certificate authority (kept in
# docker/certs on this computer, so tablets that trust it keep trusting it
# after a rebuild). The server certificate it signs names every address in
# KOOBD_HOSTS (compose.yaml: localhost and this computer's Wi-Fi address);
# it is made again when that list changes or it is about to expire.
set -e
CERTS=/etc/koobd-certs
HOSTS="${KOOBD_HOSTS:-localhost,127.0.0.1}"
mkdir -p "$CERTS"
cd "$CERTS"

if [ ! -f koobd-ca.key ] || [ ! -f koobd-ca.crt ]; then
    echo "KoobD: making the local certificate authority"
    openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
        -keyout koobd-ca.key -out koobd-ca.crt -subj "/CN=KoobD Local CA/O=KoobD" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    rm -f koobd-server.crt
fi

if [ ! -f koobd-server.crt ] || [ "$(cat hosts.txt 2>/dev/null)" != "$HOSTS" ] \
    || ! openssl x509 -checkend 2592000 -noout -in koobd-server.crt >/dev/null 2>&1; then
    echo "KoobD: making the https certificate for $HOSTS"
    SAN=""
    for host in $(echo "$HOSTS" | tr ',' ' '); do
        case "$host" in
            *[!0-9.]*) entry="DNS:$host" ;;
            *) entry="IP:$host" ;;
        esac
        SAN="${SAN:+$SAN,}$entry"
    done
    printf "basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n" "$SAN" > server.ext
    openssl req -newkey rsa:2048 -nodes -sha256 -keyout koobd-server.key -out koobd-server.csr -subj "/CN=KoobD/O=KoobD"
    # 397 days: the longest certificate browsers accept.
    openssl x509 -req -sha256 -days 397 -in koobd-server.csr -CA koobd-ca.crt -CAkey koobd-ca.key -CAcreateserial \
        -out koobd-server.crt -extfile server.ext
    rm -f koobd-server.csr server.ext
    echo "$HOSTS" > hosts.txt
fi
chmod 600 koobd-ca.key koobd-server.key
chmod 644 koobd-ca.crt koobd-server.crt

exec apache2-foreground
