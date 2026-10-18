#!/bin/sh
set -eu

docker-entrypoint.sh mysqld &
mysql_pid="$!"

until mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1; do
  sleep 2
done

mysql -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS teacher_db"
mysql -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" < /docker-entrypoint-initdb.d/00-init.sql

wait "$mysql_pid"
