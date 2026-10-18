FROM php:8.2-apache

COPY ./docker/apache/legacy-assets.conf /etc/apache2/conf-available/legacy-assets.conf
COPY ./docker/php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini

RUN apt-get update && apt-get install -y \
    libzip-dev zip unzip \
    && docker-php-ext-install mysqli pdo pdo_mysql \
    && docker-php-ext-enable mysqli \
    && a2enmod rewrite \
    && a2enconf legacy-assets \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY ./src /var/www/html/

RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

EXPOSE 80

CMD ["apache2-foreground"]
