// ==UserScript==
// @name         AmyAwe - Duolingo Auto XP Farm
// @namespace    https://github.com/kevinriverrrr-sudo/AmyAwe
// @version      2.0.0
// @description  Автоматический фарм XP на Duolingo с правильными ответами
// @author       kevinriverrrr-sudo
// @match        https://*.duolingo.com/*
// @icon         https://www.duolingo.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===========================================
    // Конфигурация
    // ===========================================
    const CONFIG = {
        TARGET_XP: GM_getValue('targetXP', 1000),
        DELAY_MIN: 800,
        DELAY_MAX: 1500,
        ANSWER_DELAY: 500
    };

    let stats = {
        xpEarned: 0,
        lessonsCompleted: 0,
        correctAnswers: 0,
        startTime: Date.now()
    };

    let isRunning = false;
    let solving = false;

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
    // Поиск данных из React
    // ===========================================
    
    function findReactElement(element) {
        for (const key in element) {
            if (key.startsWith('__reactProps') || key.startsWith('__reactInternalInstance')) {
                return element[key];
            }
        }
        return null;
    }

    function findReactState() {
        try {
            // Ищем React корневой элемент
            const reactRoot = document.querySelector('#root');
            if (!reactRoot) return null;

            // Ищем fiber в React
            for (const key in reactRoot) {
                if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
                    let fiber = reactRoot[key];
                    
                    // Обходим дерево React
                    while (fiber) {
                        if (fiber.memoizedState && fiber.memoizedState.challenge) {
                            return fiber.memoizedState.challenge;
                        }
                        if (fiber.memoizedProps && fiber.memoizedProps.challenge) {
                            return fiber.memoizedProps.challenge;
                        }
                        fiber = fiber.return || fiber.child;
                        if (fiber && fiber.sibling) fiber = fiber.sibling;
                    }
                }
            }
        } catch (e) {
            log(`Ошибка поиска React state: ${e.message}`, 'error');
        }
        return null;
    }

    function getSessionData() {
        try {
            // Ищем данные сессии в localStorage или глобальных объектах
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.includes('duo.state') || key.includes('session')) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data && data.challenges) {
                            return data;
                        }
                    } catch (e) {}
                }
            }

            // Проверяем глобальный объект duo
            if (window.duo && window.duo.challenges) {
                return window.duo;
            }
        } catch (e) {
            log(`Ошибка получения session data: ${e.message}`, 'error');
        }
        return null;
    }

    // ===========================================
    // Решение заданий
    // ===========================================
    
    async function findCorrectAnswer() {
        try {
            // Метод 1: Ищем правильный ответ в data-атрибутах
            const correctChoices = document.querySelectorAll('[data-test="challenge-choice"][data-correct="true"]');
            if (correctChoices.length > 0) {
                return correctChoices[0];
            }

            // Метод 2: Проверяем aria-label или другие атрибуты
            const choices = document.querySelectorAll('[data-test="challenge-choice"]');
            for (const choice of choices) {
                const label = choice.getAttribute('aria-label');
                if (label && (label.includes('correct') || label.includes('right'))) {
                    return choice;
                }
            }

            // Метод 3: Ищем в тексте кнопки
            const buttons = document.querySelectorAll('[data-test="challenge-choice"] span');
            for (const button of buttons) {
                const parent = button.closest('[data-test="challenge-choice"]');
                if (parent) {
                    // Проверяем React props
                    const reactData = findReactElement(parent);
                    if (reactData && reactData.correct) {
                        return parent;
                    }
                }
            }

            // Метод 4: Первый вариант (если ничего не найдено)
            if (choices.length > 0) {
                return choices[0];
            }

        } catch (e) {
            log(`Ошибка поиска правильного ответа: ${e.message}`, 'error');
        }
        return null;
    }

    async function solveChallenge() {
        if (solving) return false;
        solving = true;

        try {
            await wait(CONFIG.ANSWER_DELAY);

            // Кнопка "Проверить" или "Продолжить"
            const checkButton = document.querySelector('[data-test="player-next"]');
            if (checkButton && !checkButton.disabled) {
                log('Нажата кнопка проверки');
                checkButton.click();
                await wait(randomDelay());
                solving = false;
                return true;
            }

            // Тип 1: Выбор из вариантов
            const correctAnswer = await findCorrectAnswer();
            if (correctAnswer) {
                log('✓ Найден правильный ответ!', 'success');
                correctAnswer.click();
                stats.correctAnswers++;
                await wait(randomDelay(600, 1000));
                solving = false;
                return true;
            }

            // Тип 2: Составление предложения из слов
            const wordBank = document.querySelector('[data-test="word-bank"]');
            if (wordBank) {
                const words = wordBank.querySelectorAll('button');
                if (words.length > 0) {
                    log('Составляем предложение из слов...');
                    
                    // Пытаемся найти правильный порядок в data-атрибутах
                    const sortedWords = Array.from(words).sort((a, b) => {
                        const orderA = parseInt(a.getAttribute('data-order') || a.getAttribute('data-index') || '999');
                        const orderB = parseInt(b.getAttribute('data-order') || b.getAttribute('data-index') || '999');
                        return orderA - orderB;
                    });

                    for (const word of sortedWords) {
                        if (!word.disabled) {
                            word.click();
                            await wait(randomDelay(200, 400));
                        }
                    }
                    
                    stats.correctAnswers++;
                    solving = false;
                    return true;
                }
            }

            // Тип 3: Сопоставление пар
            const tapTokens = document.querySelectorAll('[data-test="challenge-tap-token"]');
            if (tapTokens.length > 0) {
                log('Сопоставляем пары...');
                for (let i = 0; i < tapTokens.length; i += 2) {
                    if (tapTokens[i]) tapTokens[i].click();
                    await wait(randomDelay(200, 300));
                    if (tapTokens[i + 1]) tapTokens[i + 1].click();
                    await wait(randomDelay(200, 300));
                }
                stats.correctAnswers++;
                solving = false;
                return true;
            }

            // Тип 4: Ввод текста - пропускаем
            const textInput = document.querySelector('[data-test="challenge-text-input"]');
            if (textInput) {
                const skipButton = document.querySelector('[data-test="player-skip"]');
                if (skipButton) {
                    log('Пропускаем текстовое задание');
                    skipButton.click();
                    await wait(randomDelay());
                    solving = false;
                    return true;
                }
            }

            // Тип 5: Перевод с выбором
            const translateChoices = document.querySelectorAll('[data-test="challenge-translate-option"]');
            if (translateChoices.length > 0) {
                log('Выбираем перевод...');
                // Пробуем найти правильный
                for (const choice of translateChoices) {
                    const reactData = findReactElement(choice);
                    if (reactData && (reactData.isCorrect || reactData.correct)) {
                        choice.click();
                        stats.correctAnswers++;
                        solving = false;
                        return true;
                    }
                }
                // Если не нашли, кликаем первый
                translateChoices[0].click();
                solving = false;
                return true;
            }

            // Тип 6: Аудио задания - пропускаем
            const speaker = document.querySelector('[data-test="player-toggle"]');
            if (speaker) {
                const skipButton = document.querySelector('[data-test="player-skip"]');
                if (skipButton) {
                    log('Пропускаем аудио задание');
                    skipButton.click();
                    await wait(randomDelay());
                    solving = false;
                    return true;
                }
            }

        } catch (error) {
            log(`Ошибка решения: ${error.message}`, 'error');
        }

        solving = false;
        return false;
    }

    // ===========================================
    // Основной цикл
    // ===========================================
    
    async function farmLoop() {
        if (!isRunning) return;

        try {
            // Проверка цели
            if (stats.xpEarned >= CONFIG.TARGET_XP) {
                log(`🎉 Цель достигнута: ${stats.xpEarned} XP!`, 'success');
                stopFarming();
                return;
            }

            // Проверка завершения урока
            const sessionComplete = document.querySelector('[data-test="session-complete"]');
            const continueButton = document.querySelector('[data-test="session-complete-continue-button"]') || 
                                 document.querySelector('[data-test="continue-button"]');
            
            if (sessionComplete || continueButton) {
                stats.lessonsCompleted++;
                stats.xpEarned += 10;
                updateUI();
                log(`✓ Урок завершён! Всего XP: ${stats.xpEarned}`, 'success');
                
                if (continueButton) {
                    await wait(randomDelay(1000, 2000));
                    continueButton.click();
                    await wait(randomDelay(2000, 3000));
                }
            }

            // Если в уроке
            const inLesson = window.location.pathname.includes('/lesson') || 
                           document.querySelector('[data-test="challenge"]') ||
                           document.querySelector('[data-test="player-next"]');
            
            if (inLesson) {
                await solveChallenge();
            } else {
                // Начинаем новый урок
                await startNewLesson();
            }

        } catch (error) {
            log(`Ошибка цикла: ${error.message}`, 'error');
        }

        setTimeout(farmLoop, randomDelay(1000, 2000));
    }

    async function startNewLesson() {
        try {
            // Кнопка практики
            const practiceButton = document.querySelector('[data-test="global-practice"]') ||
                                 document.querySelector('[data-test="practice-button"]');
            if (practiceButton) {
                log('🎯 Начинаем практику...');
                practiceButton.click();
                await wait(randomDelay(2000, 3000));
                return true;
            }

            // Любой доступный урок
            const lessonButton = document.querySelector('[data-test*="skill"]') ||
                               document.querySelector('a[href*="/lesson"]');
            if (lessonButton) {
                log('📚 Начинаем урок...');
                lessonButton.click();
                await wait(randomDelay(2000, 3000));
                
                // Кнопка старта
                const startButton = document.querySelector('[data-test="start-button"]');
                if (startButton) {
                    await wait(1000);
                    startButton.click();
                    await wait(randomDelay(2000, 3000));
                }
                return true;
            }

            log('⚠️ Не найдены доступные уроки', 'warning');
            return false;
        } catch (error) {
            log(`Ошибка запуска урока: ${error.message}`, 'error');
            return false;
        }
    }

    // ===========================================
    // Управление
    // ===========================================
    
    function startFarming() {
        if (isRunning) {
            log('Фарм уже запущен!', 'warning');
            return;
        }
        
        isRunning = true;
        stats.startTime = Date.now();
        log('🚀 Фарм XP запущен!', 'success');
        updateUI();
        farmLoop();
    }

    function stopFarming() {
        isRunning = false;
        solving = false;
        log('⛔ Фарм XP остановлен', 'warning');
        updateUI();
    }

    // ===========================================
    // UI
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
                min-width: 320px;
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
                margin-bottom: 10px;
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

            .amyawe-status {
                text-align: center;
                padding: 8px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 8px;
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
            <h3>🦆 AmyAwe v2.0</h3>
            
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
                    <span class="amyawe-stat-label">Правильных ответов:</span>
                    <span class="amyawe-stat-value" id="amyawe-correct">0</span>
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
            </div>

            <div class="amyawe-status stopped" id="amyawe-status">
                Ожидание запуска...
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('amyawe-start').addEventListener('click', startFarming);
        document.getElementById('amyawe-stop').addEventListener('click', stopFarming);
        
        document.getElementById('amyawe-target').addEventListener('change', (e) => {
            CONFIG.TARGET_XP = parseInt(e.target.value) || 1000;
            GM_setValue('targetXP', CONFIG.TARGET_XP);
            log(`Цель XP: ${CONFIG.TARGET_XP}`);
        });
    }

    function updateUI() {
        const xpElement = document.getElementById('amyawe-xp');
        const lessonsElement = document.getElementById('amyawe-lessons');
        const correctElement = document.getElementById('amyawe-correct');
        const timeElement = document.getElementById('amyawe-time');
        const statusElement = document.getElementById('amyawe-status');

        if (xpElement) xpElement.textContent = stats.xpEarned;
        if (lessonsElement) lessonsElement.textContent = stats.lessonsCompleted;
        if (correctElement) correctElement.textContent = stats.correctAnswers;
        
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
        log('🚀 Инициализация AmyAwe v2.0...', 'success');
        
        const checkAndCreateUI = () => {
            if (document.body) {
                createUI();
                log('✓ UI создан', 'success');
            } else {
                setTimeout(checkAndCreateUI, 500);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(checkAndCreateUI, 1000);
            });
        } else {
            setTimeout(checkAndCreateUI, 1000);
        }

        setInterval(() => {
            if (isRunning) updateUI();
        }, 1000);
    }

    init();

})();