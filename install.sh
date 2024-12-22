#!/bin/bash

# Установка Node.js (если он не установлен)
if ! command -v node &> /dev/null
then
    echo "Node.js не найден. Устанавливаем Node.js..."
    curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Установка зависимостей
echo "Устанавливаем зависимости..."
npm install axios readline
echo "Зависимости установлены."
