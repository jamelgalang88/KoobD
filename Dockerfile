FROM php:8.2-apache

COPY ./docker/apache/legacy-assets.conf /etc/apache2/conf-available/legacy-assets.conf
COPY ./docker/php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
# https for the classroom Wi-Fi (speaking practice needs it): see koobd-ssl.conf.
COPY ./docker/apache/koobd-ssl.conf /etc/apache2/conf-available/koobd-ssl.conf
COPY ./docker/apache/start.sh /usr/local/bin/koobd-start.sh

# Writing Practice's spelling check: hunspell with English and Tagalog dictionaries.
RUN apt-get update && apt-get install -y \
    libzip-dev zip unzip openssl \
    hunspell hunspell-en-us myspell-tl \
    && docker-php-ext-install mysqli pdo pdo_mysql \
    && docker-php-ext-enable mysqli \
    && a2enmod rewrite headers ssl \
    && a2enconf legacy-assets koobd-ssl \
    && sed -i 's/\r$//' /usr/local/bin/koobd-start.sh && chmod 755 /usr/local/bin/koobd-start.sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Server-side PHP libraries (the Anthropic SDK for Writing Practice's AI
# review), kept outside the web root.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY ./docker/php-lib/composer.json ./docker/php-lib/composer.lock /opt/koobd-lib/
RUN cd /opt/koobd-lib && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --no-interaction --no-progress

COPY ./src /var/www/html/

RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

EXPOSE 80 443

CMD ["/usr/local/bin/koobd-start.sh"]
