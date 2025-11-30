// ==UserScript==
// @name         AmyAwe - Duolingo Auto XP Farm
// @namespace    https://github.com/kevinriverrrr-sudo/AmyAwe
// @version      1.0.0
// @description  Автоматический фарм XP на Duolingo с удобным интерфейсом
// @author       kevinriverrrr-sudo
// @match        https://*.duolingo.com/*
// @icon         https://www.duolingo.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===========================================
    // Конфигурация
    // ===========================================
    const CONFIG = {
        AUTO_MODE: GM_getValue('autoMode', false),
        TARGET_XP: GM_getValue('targetXP', 1000),
        DELAY_MIN: 1500,  // Минимальная задержка между действиями (мс)
        DELAY_MAX: 3000,  // Максимальная задержка между действиями (мс)
        SAFE_MODE: GM_getValue('safeMode', true)
    };

    let stats = {
        xpEarned: 0,
        lessonsCompleted: 0,
        startTime: Date.now()
    };

    let isRunning = false;
    let currentLesson = null;

    // ===========================================
    // Утилиты
    // ===========================================
    
    function randomDelay(min = CONFIG.DELAY_MIN, max = CONFIG.DELAY_MAX) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = '[AmyAwe]';
        const styles = {
            info: 'color: #3B82F6',
            success: 'color: #10B981',
            error: 'color: #EF4444',
            warning: 'color: #F59E0B'
        };
        console.log(`%c${prefix} [${timestamp}] ${message}`, styles[type] || styles.info);
    }

    // ===========================================
    // Работа с React компонентами
    // ===========================================
    
    function findReact(dom, traverseUp = 0) {
        const key = Object.keys(dom).find(key => {
            return key.startsWith('__reactFiber$') ||
                   key.startsWith('__reactInternalInstance$') ||
                   key.startsWith('__reactProps$');
        });
        if (key) {
            const fiber = dom[key];
            if (fiber) {
                if (traverseUp > 0) {
                    let parent = fiber;
                    for (let i = 0; i < traverseUp; i++) {
                        parent = parent.return || parent._debugOwner;
                        if (!parent) break;
                    }
                    return parent;
                }
                return fiber;
            }
        }
        return null;
    }

    function getReactProps(element) {
        if (!element) return null;
        const fiber = findReact(element, 1);
        if (fiber && fiber.memoizedProps) {
            return fiber.memoizedProps;
        }
        return null;
    }

    // ===========================================
    // Получение JWT токена
    // ===========================================
    
    function getJwtToken() {
        const match = document.cookie.match(/jwt_token=([^;]+)/);
        return match ? match[1] : null;
    }

    // ===========================================
    // API запросы
    // ===========================================
    
    async function makeApiRequest(endpoint, method = 'GET', data = null) {
        const token = getJwtToken();
        if (!token) {
            log('Не найден JWT токен. Пожалуйста, войдите в аккаунт.', 'error');
            return null;
        }

        try {
            const options = {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`https://www.duolingo.com${endpoint}`, options);
            
            if (!response.ok) {
                log(`Ошибка API: ${response.status}`, 'error');
                return null;
            }

            return await response.json();
        } catch (error) {
            log(`Ошибка запроса: ${error.message}`, 'error');
            return null;
        }
    }

    // ===========================================
    // Решение заданий
    // ===========================================
    
    async function solveChallenge() {
        await wait(randomDelay());

        // Поиск кнопки проверки ответа
        const checkButton = document.querySelector('[data-test="player-next"]');
        if (checkButton && !checkButton.disabled) {
            checkButton.click();
            log('Нажата кнопка проверки');
            return true;
        }

        // Поиск вариантов ответов
        const choices = document.querySelectorAll('[data-test="challenge-choice"]');
        if (choices.length > 0) {
            // Выбираем случайный вариант для безопасности
            const randomChoice = choices[Math.floor(Math.random() * choices.length)];
            randomChoice.click();
            log('Выбран вариант ответа');
            await wait(randomDelay(500, 1000));
            return true;
        }

        // Поиск кнопок слов для составления предложения
        const wordButtons = document.querySelectorAll('[data-test="word-bank"] button');
        if (wordButtons.length > 0) {
            // Нажимаем на все кнопки в случайном порядке
            const shuffled = Array.from(wordButtons).sort(() => Math.random() - 0.5);
            for (const button of shuffled) {
                button.click();
                await wait(randomDelay(200, 500));
            }
            log('Составлено предложение из слов');
            return true;
        }

        // Поиск полей ввода текста
        const textareas = document.querySelectorAll('[data-test="challenge-text-input"]');
        if (textareas.length > 0) {
            // Для безопасности просто пропускаем
            const skipButton = document.querySelector('[data-test="player-skip"]');
            if (skipButton) {
                skipButton.click();
                log('Пропущено задание с вводом текста');
                return true;
            }
        }

        return false;
    }

    // ===========================================
    // Основной цикл фарма
    // ===========================================
    
    async function farmLoop() {
        if (!isRunning) return;

        try {
            // Проверка достижения цели
            if (stats.xpEarned >= CONFIG.TARGET_XP) {
                log(`Цель достигнута: ${stats.xpEarned} XP`, 'success');
                stopFarming();
                return;
            }

            // Проверка, находимся ли мы в уроке
            const inLesson = window.location.pathname.includes('/lesson');
            
            if (inLesson) {
                // Решаем задание
                const solved = await solveChallenge();
                if (solved) {
                    await wait(randomDelay());
                }
            } else {
                // Начинаем новый урок
                await startNewLesson();
            }

            // Проверка завершения урока
            const continueButton = document.querySelector('[data-test="continue-button"]');
            if (continueButton) {
                stats.lessonsCompleted++;
                stats.xpEarned += 10; // Примерное количество XP за урок
                updateUI();
                log(`Урок завершён! Всего XP: ${stats.xpEarned}`, 'success');
                await wait(randomDelay());
                continueButton.click();
            }

        } catch (error) {
            log(`Ошибка в цикле фарма: ${error.message}`, 'error');
        }

        // Продолжаем цикл
        setTimeout(farmLoop, randomDelay());
    }

    async function startNewLesson() {
        // Поиск доступных уроков
        const practiceButton = document.querySelector('[data-test="global-practice"]');
        if (practiceButton) {
            log('Начинаем практику...');
            practiceButton.click();
            await wait(randomDelay(2000, 3000));
            return true;
        }

        const lessonButtons = document.querySelectorAll('[data-test*="lesson"], [data-test*="skill"]');
        if (lessonButtons.length > 0) {
            const randomLesson = lessonButtons[Math.floor(Math.random() * lessonButtons.length)];
            log('Начинаем урок...');
            randomLesson.click();
            await wait(randomDelay(1000, 2000));
            
            // Подтверждение начала урока
            const startButton = document.querySelector('[data-test="start-button"]');
            if (startButton) {
                startButton.click();
                await wait(randomDelay(2000, 3000));
            }
            return true;
        }

        log('Не найдены доступные уроки', 'warning');
        return false;
    }

    // ===========================================
    // Управление фармом
    // ===========================================
    
    function startFarming() {
        if (isRunning) {
            log('Фарм уже запущен', 'warning');
            return;
        }
        
        isRunning = true;
        stats.startTime = Date.now();
        log('Фарм XP запущен', 'success');
        updateUI();
        farmLoop();
    }

    function stopFarming() {
        isRunning = false;
        log('Фарм XP остановлен', 'warning');
        updateUI();
    }

    // ===========================================
    // UI Интерфейс
    // ===========================================
    
    function createUI() {
        GM_addStyle(`
            #amyawe-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                z-index: 999999;
                font-family: 'Segoe UI', Arial, sans-serif;
                color: white;
                min-width: 300px;
                backdrop-filter: blur(10px);
            }

            #amyawe-panel h3 {
                margin: 0 0 15px 0;
                font-size: 20px;
                font-weight: 600;
                text-align: center;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }

            .amyawe-stats {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 15px;
            }

            .amyawe-stat-row {
                display: flex;
                justify-content: space-between;
                margin: 8px 0;
                font-size: 14px;
            }

            .amyawe-stat-label {
                opacity: 0.9;
            }

            .amyawe-stat-value {
                font-weight: 600;
            }

            .amyawe-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }

            .amyawe-btn {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .amyawe-btn-start {
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                color: white;
            }

            .amyawe-btn-start:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(17, 153, 142, 0.4);
            }

            .amyawe-btn-stop {
                background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%);
                color: white;
            }

            .amyawe-btn-stop:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(238, 9, 121, 0.4);
            }

            .amyawe-settings {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                padding: 12px;
            }

            .amyawe-setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 10px 0;
            }

            .amyawe-input {
                width: 80px;
                padding: 6px 10px;
                border: none;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.9);
                color: #333;
                font-size: 14px;
                font-weight: 600;
            }

            .amyawe-toggle {
                position: relative;
                width: 50px;
                height: 26px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 13px;
                cursor: pointer;
                transition: background 0.3s;
            }

            .amyawe-toggle.active {
                background: #38ef7d;
            }

            .amyawe-toggle-slider {
                position: absolute;
                top: 3px;
                left: 3px;
                width: 20px;
                height: 20px;
                background: white;
                border-radius: 10px;
                transition: left 0.3s;
            }

            .amyawe-toggle.active .amyawe-toggle-slider {
                left: 27px;
            }

            .amyawe-status {
                text-align: center;
                padding: 8px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                margin-top: 10px;
                font-size: 13px;
                font-weight: 600;
            }

            .amyawe-status.running {
                background: rgba(56, 239, 125, 0.3);
            }

            .amyawe-status.stopped {
                background: rgba(238, 9, 121, 0.3);
            }
        `);

        const panel = document.createElement('div');
        panel.id = 'amyawe-panel';
        panel.innerHTML = `
            <h3>🦆 AmyAwe Auto Farm</h3>
            
            <div class="amyawe-stats">
                <div class="amyawe-stat-row">
                    <span class="amyawe-stat-label">XP заработано:</span>
                    <span class="amyawe-stat-value" id="amyawe-xp">0</span>
                </div>
                <div class="amyawe-stat-row">
                    <span class="amyawe-stat-label">Уроков пройдено:</span>
                    <span class="amyawe-stat-value" id="amyawe-lessons">0</span>
                </div>
                <div class="amyawe-stat-row">
                    <span class="amyawe-stat-label">Время работы:</span>
                    <span class="amyawe-stat-value" id="amyawe-time">00:00:00</span>
                </div>
            </div>

            <div class="amyawe-controls">
                <button class="amyawe-btn amyawe-btn-start" id="amyawe-start">Старт</button>
                <button class="amyawe-btn amyawe-btn-stop" id="amyawe-stop">Стоп</button>
            </div>

            <div class="amyawe-settings">
                <div class="amyawe-setting-row">
                    <span>Цель XP:</span>
                    <input type="number" class="amyawe-input" id="amyawe-target" value="${CONFIG.TARGET_XP}" min="100" step="100">
                </div>
                <div class="amyawe-setting-row">
                    <span>Безопасный режим:</span>
                    <div class="amyawe-toggle ${CONFIG.SAFE_MODE ? 'active' : ''}" id="amyawe-safe-mode">
                        <div class="amyawe-toggle-slider"></div>
                    </div>
                </div>
            </div>

            <div class="amyawe-status stopped" id="amyawe-status">
                Ожидание запуска...
            </div>
        `;

        document.body.appendChild(panel);

        // Обработчики событий
        document.getElementById('amyawe-start').addEventListener('click', startFarming);
        document.getElementById('amyawe-stop').addEventListener('click', stopFarming);
        
        document.getElementById('amyawe-target').addEventListener('change', (e) => {
            CONFIG.TARGET_XP = parseInt(e.target.value) || 1000;
            GM_setValue('targetXP', CONFIG.TARGET_XP);
            log(`Цель XP изменена на: ${CONFIG.TARGET_XP}`);
        });

        document.getElementById('amyawe-safe-mode').addEventListener('click', (e) => {
            CONFIG.SAFE_MODE = !CONFIG.SAFE_MODE;
            e.currentTarget.classList.toggle('active');
            GM_setValue('safeMode', CONFIG.SAFE_MODE);
            log(`Безопасный режим: ${CONFIG.SAFE_MODE ? 'ВКЛ' : 'ВЫКЛ'}`);
        });
    }

    function updateUI() {
        const xpElement = document.getElementById('amyawe-xp');
        const lessonsElement = document.getElementById('amyawe-lessons');
        const timeElement = document.getElementById('amyawe-time');
        const statusElement = document.getElementById('amyawe-status');

        if (xpElement) xpElement.textContent = stats.xpEarned;
        if (lessonsElement) lessonsElement.textContent = stats.lessonsCompleted;
        
        if (timeElement) {
            const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            timeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (statusElement) {
            if (isRunning) {
                statusElement.textContent = '✅ Фарм запущен';
                statusElement.className = 'amyawe-status running';
            } else {
                statusElement.textContent = '⛔ Фарм остановлен';
                statusElement.className = 'amyawe-status stopped';
            }
        }
    }

    // ===========================================
    // Инициализация
    // ===========================================
    
    function init() {
        log('Инициализация AmyAwe Auto Farm...', 'success');
        
        // Ждем загрузки страницы
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(createUI, 2000);
            });
        } else {
            setTimeout(createUI, 2000);
        }

        // Обновление UI каждую секунду
        setInterval(() => {
            if (isRunning) updateUI();
        }, 1000);
    }

    // Запуск
    init();

})();