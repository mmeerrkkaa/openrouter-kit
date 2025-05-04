# OpenRouter Kit

[![Версия npm](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![Лицензия: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.en.md)
---

**OpenRouter Kit** — это мощная, гибкая и удобная TypeScript/JavaScript библиотека для взаимодействия с [OpenRouter API](https://openrouter.ai/). Она упрощает работу с LLM, предоставляя унифицированный API для чатов, **управление историей с метаданными**, **анализ истории**, **детализированную обработку инструментов** (function calling), маршрутизацию запросов, веб-поиск, токены рассуждений и многое другое.

## 📦 Установка

```bash
npm install openrouter-kit
# или
yarn add openrouter-kit
# или
pnpm add openrouter-kit
```

## 🚀 Быстрый старт: Примеры использования

Вот несколько примеров, чтобы быстро начать работу:

### 1. Простая генерация ответа

Самый базовый пример для отправки запроса и получения ответа от модели.

```typescript
// simple-chat.ts
import { OpenRouterClient } from 'openrouter-kit';

// Инициализируем клиент с вашим API ключом
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: "google/gemini-2.5-flash-preview" // Модель по умолчанию для всех вызовов
});

async function main() {
  console.log('Отправка простого запроса...');
  try {
    const result = await client.chat({
      prompt: 'Напиши короткое приветствие для README.',
      model: 'openai/gpt-4o-mini', // Переопределяем модель для этого вызова
      temperature: 0.7,
    });

    console.log('--- Результат ---');
    console.log('Ответ модели:', result.content);
    console.log('Использованная модель:', result.model);
    console.log('Использовано токенов:', result.usage);
  } catch (error: any) {
    console.error("Ошибка:", error.message);
  } finally {
    await client.destroy();
  }
}

main();
```

### 2. Пример диалога (с управлением историей)

Чтобы поддерживать контекст диалога, используйте `historyAdapter` и передавайте `user` ID. Библиотека автоматически загрузит и сохранит историю **вместе с метаданными о вызовах API**.

```typescript
// dialog-chat.ts
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // Используем MemoryHistoryStorage для хранения истории в памяти
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Включаем расчет стоимости (сохраняется в метаданных)
  model: "google/gemini-2.5-flash-preview",
  debug: false,
});

const userId = 'dialog-user-123'; // Уникальный ID для пользователя

async function runDialog() {
  try {
    // Первое сообщение
    console.log(`[${userId}] Вы: Привет! Запомни, мой любимый цвет - синий.`);
    const result1 = await client.chat({
      user: userId, // <-- Передаем ID пользователя для автоматического управления историей
      prompt: 'Привет! Запомни, мой любимый цвет - синий.',
    });
    console.log(`[${userId}] Бот: ${result1.content}`);
    console.log(`(Стоимость: $${result1.cost?.toFixed(8) || 'N/A'})`);

    // Второе сообщение (модель должна помнить контекст)
    console.log(`\n[${userId}] Вы: Какой мой любимый цвет?`);
    const result2 = await client.chat({
      user: userId, // <-- Тот же ID пользователя
      prompt: 'Какой мой любимый цвет?',
    });
    console.log(`[${userId}] Бот: ${result2.content}`);
    console.log(`(Стоимость: $${result2.cost?.toFixed(8) || 'N/A'})`);

  } catch (error: any) {
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
    if (error.code) console.error(`Код ошибки: ${error.code}`);
  } finally {
    console.log('\nЗавершение работы диалога...');
    await client.destroy();
  }
}

runDialog();
```

### 3. Пример использования инструментов (с получением деталей)

Этот пример показывает, как модель может использовать предоставленные вами функции (инструменты), а также как получить **детализированную информацию** о каждом вызове инструмента.

```javascript
// tools-example.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");

// --- Пример данных ---
const users = [ { id: "user_1001", nick: "alice" }, { id: "user_1002", nick: "bob" } ];
const messages = [ { id: "msg_101", userId: "user_1001", content: "Привет от alice!" }, { id: "msg_102", userId: "user_1002", content: "Привет от bob!" } ];
// ---

// --- Определения инструментов ---
const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Получает ID пользователя по его никнейму",
      parameters: { type: "object", properties: { nick: { type: "string" } }, required: ["nick"] },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserIdByNick] Args: ${JSON.stringify(args)}`);
      const user = users.find(u => u.nick.toLowerCase() === args.nick.toLowerCase());
      // Имитация небольшой задержки
      await new Promise(res => setTimeout(res, 50));
      return user ? { userId: user.id, found: true } : { userId: null, found: false };
    }
  },
  {
    type: "function",
    function: {
      name: "getUserMessages",
      description: "Получает все сообщения пользователя по его ID",
      parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserMessages] Args: ${JSON.stringify(args)}`);
      const userMessages = messages.filter(m => m.userId === args.userId);
      // Имитация небольшой задержки
      await new Promise(res => setTimeout(res, 100));
      return { messages: userMessages, count: userMessages.length, found: userMessages.length > 0 };
    }
  }
];
// ---

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.5-flash-preview", // Модель, поддерживающая инструменты
});

async function main() {
  try {
    const promptAlice = "Найди все сообщения пользователя alice.";
    console.log(`\nЗапрос: "${promptAlice}"`);
    const resultAlice = await client.chat({
      prompt: promptAlice,
      tools: userTools,
      temperature: 0.5,
      includeToolResultInReport: true // <-- Запрашиваем полные детали вызовов
    });
    console.log(`Ответ:\n${resultAlice.content}`);
    console.log(`(Всего вызовов инструментов: ${resultAlice.toolCallsCount})`);

    // --- Вывод деталей вызовов инструментов ---
    if (resultAlice.toolCalls && resultAlice.toolCalls.length > 0) {
        console.log("\n--- Детали вызовов инструментов ---");
        resultAlice.toolCalls.forEach((call, index) => {
            console.log(`Вызов ${index + 1}:`);
            console.log(`  Инструмент: ${call.toolName}`);
            console.log(`  Статус: ${call.status}`);
            console.log(`  Длительность: ${call.durationMs}ms`);
            if (call.status === 'success') {
                 // Выводим результат, т.к. includeToolResultInReport: true
                 console.log(`  Результат:`, call.result);
            } else if (call.error) {
                 console.log(`  Ошибка: ${call.error.message} (Тип: ${call.error.type})`);
            }
            console.log(`  Аргументы (распарсенные):`, call.parsedArgs);
            console.log("-------------------------");
        });
    }
    // ---

  } catch (error) {
    console.error("\n--- Ошибка ---");
    console.error(error);
  } finally {
    await client.destroy();
  }
}

main();
```

### 4. Запрос ответа в формате JSON (`json_object`)

Этот пример показывает, как запросить у модели ответ в виде любого валидного JSON объекта.

```typescript
// json-object-example.ts
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: 'openai/gpt-4o-mini', // Модель, хорошо работающая с JSON
});

async function main() {
  try {
    const prompt = "Предоставь информацию о пользователе John Doe: возраст 30, город New York, в формате JSON.";
    console.log(`Запрос: "${prompt}" (ожидаем JSON объект)`);

    const result = await client.chat({
      prompt: prompt,
      temperature: 0.2,
      responseFormat: {
        type: 'json_object', // <-- Запрашиваем JSON объект
      },
    });

    console.log('--- Результат ---');
    console.log('Ответ модели (тип):', typeof result.content);
    console.log('Ответ модели (содержимое):', result.content);
    console.log('Использованная модель:', result.model);

    if (result.content && typeof result.content === 'object') {
      console.log('Имя пользователя из ответа:', result.content.name || result.content.userName);
    }

  } catch (error: any) {
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
    if (error.code) console.error(`Код ошибки: ${error.code}`);
    if (error.details) console.error(`Детали:`, error.details);
  } finally {
    console.log('\nЗавершение работы...');
    await client.destroy();
  }
}

main();
```

### 5. Запрос ответа по JSON Schema (`json_schema`)

Этот пример показывает, как запросить ответ, строго соответствующий предоставленной JSON Schema.

```typescript
// json-schema-example.ts
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: 'openai/gpt-4o-mini', // Модель, хорошо работающая со схемами
});

// Определяем нашу JSON Schema
const answerSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Краткое изложение ответа на вопрос"
    },
    confidence: {
      type: "number",
      description: "Уверенность в ответе от 0.0 до 1.0",
      minimum: 0,
      maximum: 1
    },
    tags: {
        type: "array",
        description: "Список релевантных ключевых слов (тегов)",
        items: {
            type: "string"
        }
    }
  },
  required: ["summary", "confidence", "tags"]
};

async function main() {
  try {
    const prompt = "Объясни кратко, что такое квантовая запутанность, оцени свою уверенность и добавь теги.";
    console.log(`Запрос: "${prompt}" (ожидаем JSON по схеме 'answer')`);

    const result = await client.chat({
      prompt: prompt,
      temperature: 0.3,
      responseFormat: {
        type: 'json_schema', // <-- Запрашиваем JSON по схеме
        json_schema: {
          name: 'answer',
          schema: answerSchema,
          strict: true // <-- Просим модель строго следовать схеме (если поддерживается)
        }
      },
    });

    console.log('--- Результат ---');
    console.log('Ответ модели (тип):', typeof result.content);
    console.log('Ответ модели (содержимое):', result.content);
    console.log('Использованная модель:', result.model);

    if (result.content && typeof result.content === 'object') {
      console.log('Изложение:', result.content.summary);
      console.log('Теги:', result.content.tags?.join(', '));
    }

  } catch (error: any) {
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
    if (error.code) console.error(`Код ошибки: ${error.code}`);
    if (error.details) console.error(`Детали:`, error.details);
  } finally {
    console.log('\nЗавершение работы...');
    await client.destroy();
  }
}

main();
```

---

## 📚 Подробное руководство

Теперь, когда вы увидели основные примеры, вы можете углубиться в возможности библиотеки.

### Содержание

*   [🌟 Зачем использовать OpenRouter Kit?](#-зачем-использовать-openrouter-kit)
*   [🚀 Ключевые возможности](#-ключевые-возможности)
*   [🚕 Пример: Такси-бот](#-пример-такси-бот)
*   [⚙️ API и Концепции](#️-api-и-концепции)
    *   [OpenRouterClient](#openrouterclient)
        *   [Конфигурация (OpenRouterConfig)](#конфигурация-openrouterconfig)
        *   [Основные методы](#основные-методы-1)
        *   [Опции запроса `client.chat` (OpenRouterRequestOptions)](#-опции-запроса-clientchat-openrouterrequestoptions)
        *   [Результат `client.chat` (ChatCompletionResult)](#-результат-clientchat-chatcompletionresult)
    *   [Плагины и Middleware](#-плагины-и-middleware)
    *   [Управление историей (Адаптеры и Анализ)](#-управление-историей-адаптеры-и-анализ)
    *   [Обработка инструментов (Function Calling)](#-обработка-инструментов-function-calling)
    *   [Модуль безопасности (SecurityManager)](#-модуль-безопасности-securitymanager)
    *   [Отслеживание стоимости (Cost Tracking)](#-отслеживание-стоимости-cost-tracking)
    *   [Маршрутизация (Модели и Провайдеры)](#-маршрутизация-модели-и-провайдеры)
    *   [Веб-поиск](#-веб-поиск)
    *   [Токены Рассуждений (Reasoning Tokens)](#-токены-рассуждений-reasoning-tokens)
    *   [Формат ответа (responseFormat и Structured Outputs)](#️-формат-ответа-responseformat-и-structured-outputs)
    *   [Обработка ошибок](#️-обработка-ошибок)
    *   [Логирование](#-логирование)
    *   [Прокси](#-прокси)
*   [📄 Лицензия](#-лицензия)

### 🌟 Зачем использовать OpenRouter Kit?

*   **Простота:** Сложные взаимодействия с API, управление историей, обработка инструментов, маршрутизация скрыты за простым методом `client.chat()`.
*   **Гибкость:** Настраивайте модели, параметры генерации, **хранение истории (требует адаптер)**, безопасность, маршрутизацию провайдеров/моделей и многое другое как глобально, так и для каждого запроса.
*   **Аналитика:** Встроенные инструменты для анализа сохраненной истории чатов (стоимость, токены, использование моделей).
*   **Безопасность:** Встроенный модуль безопасности помогает защитить ваши приложения и пользователей при использовании инструментов.
*   **Расширяемость:** Используйте плагины и middleware для добавления пользовательской логики без изменения ядра библиотеки.
*   **Надежность:** Полная типизация на TypeScript, предсказуемая обработка ошибок (включая структурированные ошибки инструментов) и управление ресурсами.
*   **Современные функции:** Поддержка веб-поиска, токенов рассуждений, структурированных выводов и других возможностей OpenRouter API.

### 🚀 Ключевые возможности

*   **🤖 Универсальный чат:** Простой и мощный API (`client.chat`) для взаимодействия с любой моделью, доступной через OpenRouter.
*   **📜 Управление историей с метаданными:** **Требует конфигурации `historyAdapter`**. Автоматическая загрузка и сохранение истории диалогов для каждого пользователя (`user`), включая **метаданные о вызовах API** (модель, токены, стоимость и т.д.).
    *   Гибкая система истории на базе **адаптеров** (`IHistoryStorage`).
    *   В комплекте: `MemoryHistoryStorage`, `DiskHistoryStorage`.
    *   Легко подключать свои адаптеры или использовать готовый плагин (`createRedisHistoryPlugin`).
    *   Настройка TTL кэша (`historyTtl`) и интервалов очистки (`historyCleanupInterval`).
*   **📊 Анализ истории:** Получение агрегированной статистики из сохраненной истории через `client.getHistoryAnalyzer()`:
    *   `getStats()`: Общая стоимость, токены, количество вызовов, статистика по моделям и причинам завершения.
    *   `getCostOverTime()`: Динамика затрат по дням/часам/минутам.
    *   `getTokenUsageByModel()`: Распределение использования токенов по моделям.
*   **🛠️ Обработка инструментов (Function Calling):** Бесшовная интеграция вызова ваших функций моделью.
    *   Определение инструментов (`Tool`) с JSON Schema для валидации аргументов.
    *   Автоматический парсинг, валидация и **проверка безопасности** аргументов.
    *   Выполнение ваших `execute` функций с передачей контекста (`ToolContext`).
    *   Автоматическая отправка результатов обратно модели.
    *   **Структурированная обработка ошибок инструментов** для лучшего понимания моделью.
    *   **Детализированный отчет о вызовах инструментов** доступен в `ChatCompletionResult.toolCalls` (опционально включает полный результат через `includeToolResultInReport`).
    *   Настраиваемый лимит на рекурсивные вызовы (`maxToolCalls`).
*   **🛡️ Модуль безопасности:** Комплексная и настраиваемая защита.
    *   **Аутентификация:** JWT (встроенная), `api-key`, `custom`.
    *   **Контроль доступа (ACL):** По ролям, скоупам, API-ключам, явным правилам.
    *   **Ограничение частоты (Rate Limiting):** Настраиваемые лимиты для пользователей/ролей. (Стандартная реализация **не** для распределенных систем).
    *   **Санитизация аргументов:** Защита от опасных паттернов (SQLi, XSS и др.). Режим аудита.
    *   **Система событий** для мониторинга.
*   **📈 Отслеживание стоимости (Cost Tracking):** (Опционально) Автоматический расчет примерной стоимости каждого вызова API. Фоновое обновление цен. Метод `getCreditBalance()`. Стоимость также сохраняется в метаданных истории.
*   **🔄 Маршрутизация (Модели и Провайдеры):**
    *   **Модели:** Указание резервных моделей (`modelFallbacks` в конфиге или `models` в запросе).
    *   **Провайдеры:** Тонкая настройка выбора провайдера для каждого запроса (`provider` в запросе) или глобально (`defaultProviderRouting` в конфиге) - сортировка (цена, скорость), порядок, игнорирование, требования к параметрам и др.
*   **🌐 Веб-поиск:** (Опционально) Интеграция результатов веб-поиска в ответ модели через опцию `plugins: [{ id: 'web', ... }]` или суффикс `:online` к имени модели. Возвращает аннотации (`annotations`) с источниками.
*   **🤔 Токены Рассуждений (Reasoning Tokens):** (Опционально) Запрос и получение шагов рассуждений модели через опцию `reasoning`.
*   **📐 Структурированные Выводы:** Запрос ответа в формате JSON (`responseFormat: { type: 'json_object' }`) или по строгой JSON Schema (`responseFormat: { type: 'json_schema', json_schema: {...} }`), включая поддержку флага `strict`.
*   **⚙️ Гибкая конфигурация:** Настройка API ключа, модели, эндпоинта, таймаутов, **прокси**, заголовков, **адаптера истории** и многого другого через `OpenRouterConfig`.
*   **💡 Типизация:** Полностью на TypeScript.
*   **🚦 Обработка ошибок:** Понятная иерархия кастомных ошибок (`OpenRouterError` и подклассы) с кодами (`ErrorCode`) и деталями.
*   **📝 Логирование:** Встроенный логгер (`Logger`) с префиксами и режимом отладки (`debug`).
*   **✨ Простота использования:** Высокоуровневый API.
*   **🧹 Управление ресурсами:** Метод `client.destroy()` для корректного освобождения ресурсов.
*   **🧩 Плагин-система и Middleware:** Расширение функциональности без изменения ядра.

### 🚕 Пример: Такси-бот

Этот пример демонстрирует использование истории диалогов и вызова инструментов. **Обратите внимание на обязательное добавление `historyAdapter` и соответствующий `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.5-flash-preview",
  historyAdapter: new MemoryHistoryStorage(), // Обязательно для истории
  enableCostTracking: true,
  debug: false,
});

let orderAccepted = false;

// --- Определения инструментов ---
const taxiTools = [
  {
    type: "function",
    function: {
      name: "estimateRideCost",
      description: "Оценивает стоимость поездки на такси между двумя адресами.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Адрес отправления (например, 'ул. Ленина, 1, Москва')" },
          to: { type: "string", description: "Адрес назначения (например, 'ул. Тверская, 10, Москва')" }
        },
        required: ["from", "to"]
      },
    },
    execute: async (args) => {
      console.log(`[Инструмент estimateRideCost] Расчет стоимости от ${args.from} до ${args.to}...`);
      const cost = Math.floor(Math.random() * 900) + 100;
      console.log(`[Инструмент estimateRideCost] Рассчитанная стоимость: ${cost} RUB`);
      return { estimatedCost: cost, currency: "RUB" };
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Принимает и подтверждает заказ такси, назначает водителя.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Подтвержденный адрес отправления" },
          to: { type: "string", description: "Подтвержденный адрес назначения" },
          estimatedCost: { type: "number", description: "Примерная стоимость поездки (если известна)"}
        },
        required: ["from", "to"]
      },
    },
    execute: async (args, context) => {
      console.log(`[Инструмент acceptOrder] Принятие заказа от ${args.from} до ${args.to}...`);
      console.log(`[Инструмент acceptOrder] Заказ инициирован пользователем: ${context?.userInfo?.userId || 'anonymous'}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true;
      return `Заказ успешно принят! Водитель #${driverNumber} назначен и скоро будет у вас по адресу ${args.from}. Пункт назначения: ${args.to}.`;
    }
  }
];

function askQuestion(query) {
  return new Promise((resolve) => {
    readline.question(query, (answer) => {
      resolve(answer);
    });
  });
}

const systemPrompt = `Ты — дружелюбный и эффективный оператор службы такси по имени "Кит". Твоя задача - помочь клиенту заказать такси.
1. Уточни адрес отправления ('from') и адрес назначения ('to'), если клиент их не указал. Будь вежлив.
2. Как только адреса известны, ОБЯЗАТЕЛЬНО используй инструмент 'estimateRideCost', чтобы сообщить клиенту примерную стоимость.
3. Дождись, пока клиент подтвердит, что его устраивает стоимость и он готов сделать заказ (например, словами "заказывайте", "хорошо", "да", "подходит").
4. После подтверждения клиента, используй инструмент 'acceptOrder', передав ему адреса 'from' и 'to'.
5. После вызова 'acceptOrder' сообщи клиенту результат, который вернул инструмент.
6. Не придумывай номера водителей или статус заказа сам, полагайся на ответ от инструмента 'acceptOrder'.
7. Если пользователь спрашивает что-то не по теме заказа такси, вежливо верни его к теме.`;

async function chatWithTaxiBot() {
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nБот Кит: Здравствуйте! Я ваш виртуальный помощник... (ID сессии: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("Вы: ");
      if (userMessage.toLowerCase() === 'выход' || userMessage.toLowerCase() === 'quit') {
          console.log("Бот Кит: Спасибо за обращение! До свидания.");
          break;
      }

      console.log("Бот Кит: Минутку, обрабатываю ваш запрос...");
      const result = await client.chat({
        user: userId,
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools,
        temperature: 0.5,
        maxToolCalls: 5
        // includeToolResultInReport: true // Можно добавить для отладки
      });

      console.log(`\nБот Кит: ${result.content}\n`);

      if (client.isDebugMode() || (result.toolCalls && result.toolCalls.length > 0)) { // Показываем детали, если включен debug или были вызовы
          console.log(`[Отладка] Модель: ${result.model}, Вызовы инстр.: ${result.toolCallsCount}, Стоимость: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Причина: ${result.finishReason}`);
          // Выводим детали вызовов инструментов, если они есть
          if (result.toolCalls && result.toolCalls.length > 0) {
              console.log("[Отладка] Детали вызовов инструментов:");
              result.toolCalls.forEach((call, i) => console.log(`  ${i+1}. ${call.toolName} (${call.status}, ${call.durationMs}ms)`));
          }
          if (result.reasoning) console.log(`[Отладка] Рассуждения: ${result.reasoning}`);
          if (result.annotations && result.annotations.length > 0) console.log(`[Отладка] Аннотации:`, result.annotations);
      }

      if (orderAccepted) {
        console.log("Бот Кит: Если у вас есть еще вопросы, я готов помочь!");
      }
    }
  } catch (error) {
    console.error("\n--- Произошла Ошибка ---");
    if (error instanceof Error) {
        console.error(`Тип: ${error.constructor.name}`);
        console.error(`Сообщение: ${error.message}`);
        if ((error as any).code) console.error(`Код: ${(error as any).code}`);
        if ((error as any).statusCode) console.error(`Статус: ${(error as any).statusCode}`);
        if ((error as any).details) console.error(`Детали:`, (error as any).details);
    } else {
        console.error("Неизвестная ошибка:", error);
    }
  } finally {
    readline.close();
    await client.destroy();
    console.log("\nКлиент остановлен. Сессия завершена.");
  }
}

chatWithTaxiBot();
```

### ⚙️ API и Концепции

#### `OpenRouterClient`

Основной класс для взаимодействия с библиотекой.

##### Конфигурация (`OpenRouterConfig`)

При создании клиента (`new OpenRouterClient(config)`) передается объект конфигурации. Ключевые поля:

*   `apiKey` (string, **обязательно**): Ваш API ключ OpenRouter.
*   `apiEndpoint?` (string): URL эндпоинта для чат-комплишенов.
*   `apiBaseUrl?` (string): Базовый URL для вспомогательных эндпоинтов (например, `/models`, `/auth/key`). По умолчанию `https://openrouter.ai/api/v1`.
*   `model?` (string): Модель по умолчанию для запросов (например, `"google/gemini-2.5-flash-preview"`).
*   `debug?` (boolean): Включить подробное логирование (по умолчанию: `false`).
*   `proxy?` (string | object | null): Настройки HTTP/HTTPS прокси.
*   `referer?` (string): Значение заголовка `HTTP-Referer`.
*   `title?` (string): Значение заголовка `X-Title`.
*   `axiosConfig?` (object): Дополнительная конфигурация для Axios.
*   `historyAdapter?` (IHistoryStorage): **Обязательно для использования истории и анализа.** Экземпляр адаптера хранилища истории (например, `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Время жизни (TTL) записей в кэше истории `UnifiedHistoryManager` (в миллисекундах).
*   `historyCleanupInterval?` (number): Интервал очистки просроченных записей из кэша истории `UnifiedHistoryManager` (в миллисекундах).
*   `defaultProviderRouting?` (ProviderRoutingConfig): Правила маршрутизации провайдеров по умолчанию.
*   `modelFallbacks?` (string[]): Список резервных моделей по умолчанию.
*   `responseFormat?` (ResponseFormat | null): Формат ответа по умолчанию.
*   `maxToolCalls?` (number): Максимальное количество циклов вызова инструментов за один вызов `chat()` (по умолчанию: 10).
*   `strictJsonParsing?` (boolean): Выбрасывать ошибку при невалидном JSON в ответе (если запрошен JSON формат)? (по умолчанию: `false`, возвращает `null`).
*   `security?` (SecurityConfig): Конфигурация модуля безопасности.
*   `enableCostTracking?` (boolean): Включить отслеживание стоимости (по умолчанию: `false`).
*   `priceRefreshIntervalMs?` (number): Интервал обновления цен моделей (по умолчанию: 6 часов).
*   `initialModelPrices?` (object): Начальные цены моделей для избежания первого запроса цен.
*   *Устаревшие поля:* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`, `enableReasoning`, `webSearch`.

##### Основные методы

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Основной метод для отправки запроса в чат.
*   `getHistoryManager(): UnifiedHistoryManager`: Возвращает менеджер истории.
*   `getHistoryAnalyzer(): HistoryAnalyzer`: Возвращает анализатор истории.
*   `getSecurityManager(): SecurityManager | null`: Возвращает менеджер безопасности.
*   `getCostTracker(): CostTracker | null`: Возвращает трекер стоимости.
*   `getCreditBalance(): Promise<CreditBalance>`: Запрашивает баланс кредитов.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Возвращает кэш цен моделей.
*   `refreshModelPrices(): Promise<void>`: Принудительно обновляет кэш цен.
*   `createAccessToken(userInfo, expiresIn?): string`: Генерирует JWT (если настроено).
*   `use(plugin): Promise<void>`: Регистрирует плагин.
*   `useMiddleware(fn): void`: Регистрирует middleware.
*   `on(event, handler)` / `off(event, handler)`: Подписка/отписка от событий (`'error'`, `'security:*'`, `'tool:call'`, и т.д.).
*   `destroy(): Promise<void>`: Освобождает ресурсы.

##### Опции запроса `client.chat` (`OpenRouterRequestOptions`)

Эти опции передаются в метод `client.chat()` для настройки конкретного запроса:

*   `prompt?` (string): Простой текстовый запрос пользователя. **Или** `customMessages` **обязателен**.
*   `customMessages?` (Message[] | null): Полный массив сообщений для отправки (переопределяет `prompt` и историю). **Или** `prompt` **обязателен**.
*   `user?` (string): ID пользователя для автоматического управления историей (требует `historyAdapter`).
*   `group?` (string | null): ID группы для истории (используется вместе с `user`).
*   `systemPrompt?` (string | null): Системный промпт для запроса.
*   `accessToken?` (string | null): Токен доступа для проверок безопасности.
*   `model?` (string): ID модели для этого запроса (переопределяет дефолтную). Можно использовать суффикс `:online` для активации веб-поиска.
*   `temperature?`, `maxTokens?`, `topP?`, `presencePenalty?`, `frequencyPenalty?`, `stop?`, `seed?`, `logitBias?`: Стандартные параметры генерации LLM.
*   `tools?` (Tool[] | null): Массив доступных инструментов для этого запроса.
*   `toolChoice?`: Управление выбором инструментов моделью (`'auto'`, `'none'`, `{ type: "function", function: { name: "..." } }`).
*   `parallelToolCalls?` (boolean): Разрешить модели запрашивать несколько инструментов параллельно.
*   `maxToolCalls?` (number): Переопределить лимит рекурсивных вызовов инструментов для этого запроса.
*   `includeToolResultInReport?` (boolean): **(Новое)** Включать ли полный результат выполнения инструмента в поле `result` объекта `ToolCallDetail` в итоговом `ChatCompletionResult.toolCalls`. По умолчанию `false`.
*   `responseFormat?` (ResponseFormat | null): Запросить конкретный формат ответа (JSON Object или JSON Schema).
*   `strictJsonParsing?` (boolean): Переопределить настройку строгой проверки JSON для этого запроса.
*   `provider?` (ProviderRoutingConfig): Правила маршрутизации провайдеров для этого запроса.
*   `models?` (string[]): Список моделей (основная + фоллбэки) для этого запроса.
*   `plugins?` (PluginConfig[]): Список плагинов для активации (например, `[{ id: 'web', max_results: 3 }]`).
*   `reasoning?` (ReasoningConfig): Настройки запроса токенов рассуждений (`effort`, `max_tokens`, `exclude`).
*   `transforms?` (string[]): Трансформации OpenRouter (например, `["middle-out"]`).
*   `route?`: Устаревший параметр маршрутизации OpenRouter.

##### Результат `client.chat` (`ChatCompletionResult`)

Метод `client.chat()` возвращает `Promise`, который разрешается в объект `ChatCompletionResult` со следующими полями:

*   `content` (any): Финальный контент ответа модели (строка, объект JSON и т.д., в зависимости от запроса и ответа).
*   `usage` (UsageInfo | null): Общее количество использованных токенов (промпт + ответ, включая вызовы инструментов).
*   `model` (string): ID модели, которая сгенерировала финальный ответ.
*   `toolCallsCount` (number): Общее количество вызовов инструментов в рамках этого запроса (может включать неуспешные попытки).
*   `toolCalls?` (ToolCallDetail[]): **(Новое)** Массив с подробной информацией о каждом вызове инструмента (имя, аргументы, статус, длительность, опционально результат/ошибка). Доступно, если были вызовы.
*   `finishReason` (string | null): Причина завершения генерации финального ответа (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
*   `durationMs` (number): Общее время выполнения запроса `chat()` в миллисекундах.
*   `id?` (string): ID последнего шага генерации от API OpenRouter.
*   `cost?` (number | null): Рассчитанная примерная стоимость запроса (если `enableCostTracking: true`).
*   `reasoning?` (string | null): Строка с шагами рассуждений модели (если были запрошены и возвращены).
*   `annotations?` (UrlCitationAnnotation[]): Массив аннотаций (например, цитат веб-поиска), связанных с финальным ответом.

#### 🧩 Плагины и Middleware

*   **Плагины:** Модули, расширяющие функциональность клиента. Регистрируются через `client.use(plugin)`. Могут инициализировать сервисы, заменять стандартные менеджеры (`setSecurityManager`, `setCostTracker`), добавлять middleware.
*   **Middleware:** Функции, выполняющиеся последовательно для каждого вызова `client.chat()`. Позволяют модифицировать запрос (`ctx.request`), ответ (`ctx.response`) или выполнять побочные действия (логирование, аудит). Регистрируются через `client.useMiddleware(fn)`.

#### 📜 Управление историей (Адаптеры и Анализ)

Для автоматического управления историей диалогов и ее последующего анализа **необходимо сконфигурировать `historyAdapter`** в `OpenRouterConfig`.

*   **Формат хранения (`HistoryEntry`):** Библиотека сохраняет не просто сообщения, а объекты `HistoryEntry`, которые включают само сообщение (`message`) и метаданные вызова API (`apiCallMetadata`), приведшего к этому сообщению (если применимо). Это позволяет точно отслеживать использованные модели, токены и стоимость для каждого шага диалога.
*   **Адаптер (`IHistoryStorage`):** Определяет интерфейс для хранилища (`load`, `save`, `delete`, `listKeys`, `destroy?`), работающий с `HistoryEntry[]`.
*   **`UnifiedHistoryManager`:** Внутренний компонент, использующий адаптер и управляющий кэшированием `HistoryEntry` в памяти. Предоставляет методы `getHistoryEntries`, `addHistoryEntries`, `getHistoryMessages`.
*   **Встроенные адаптеры:** `MemoryHistoryStorage`, `DiskHistoryStorage`.
*   **Подключение:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';
    const client = new OpenRouterClient({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
    ```
*   **Плагин для Redis:** Используйте `createRedisHistoryPlugin`.
*   **Анализ истории (`HistoryAnalyzer`):**
    *   Получите доступ к анализатору через `client.getHistoryAnalyzer()`.
    *   Используйте методы `getStats()`, `getCostOverTime()`, `getTokenUsageByModel()` для получения агрегированных данных.
    *   Методы принимают опциональный объект `HistoryQueryOptions` для фильтрации записей перед анализом (по дате, моделям и т.д.).

#### 🛠️ Обработка инструментов (Function Calling)

Позволяет моделям LLM вызывать ваши собственные функции.

1.  **Определение Инструмента (`Tool`):** Определите объект с `type: 'function'`, `function: { name, description?, parameters? }` (JSON Schema для аргументов) и вашей функцией `execute: (args, context?) => Promise<any> | any`. Опционально добавьте `security` правила.
2.  **Использование в `client.chat()`:** Передайте массив инструментов в `options.tools`. Библиотека автоматически:
    *   Отправит определения модели.
    *   Перехватит запрос на вызов (`finish_reason: 'tool_calls'`).
    *   Распарсит и провалидирует аргументы.
    *   **Выполнит проверки безопасности** (`SecurityManager`).
    *   Вызовет вашу функцию `execute`.
    *   **Отправит результат (или структурированную ошибку) обратно модели.**
    *   Вернет финальный ответ модели пользователю.
3.  **Результат:** Финальный ответ в `ChatCompletionResult.content`. Количество вызовов в `ChatCompletionResult.toolCallsCount`. **Детали каждого вызова** (имя, аргументы, статус, длительность, опционально результат/ошибка) доступны в `ChatCompletionResult.toolCalls` (если были вызовы). Используйте опцию `includeToolResultInReport: boolean` для контроля включения полного результата в отчет.

#### 🔒 Модуль безопасности (`SecurityManager`)

Активируется передачей объекта `security: SecurityConfig` в конструктор `OpenRouterClient`. Обеспечивает аутентификацию, контроль доступа, rate limiting и санитизацию аргументов для вызовов инструментов. Требует внимательной настройки, особенно `userAuthentication.jwtSecret`. **Стандартный Rate Limiter не подходит для распределенных систем.**

#### 📈 Отслеживание стоимости (Cost Tracking)

Включается через `enableCostTracking: true`. Рассчитывает **примерную** стоимость вызовов API на основе данных `usage` и кэшируемых цен моделей. Предоставляет методы `getCreditBalance()`, `getModelPrices()`, `refreshModelPrices()`. Стоимость также сохраняется в метаданных истории (`ApiCallMetadata.cost`) для каждого шага.

#### 🔄 Маршрутизация (Модели и Провайдеры)

*   **Модели:** Задавайте список фоллбэк-моделей в `OpenRouterConfig` (`modelFallbacks`) или для конкретного запроса в `OpenRouterRequestOptions` (`models`). Список `models` в запросе имеет приоритет.
*   **Провайдеры:** Управляйте выбором провайдера через `defaultProviderRouting` в `OpenRouterConfig` или `provider` в `OpenRouterRequestOptions`. Опция `provider` в запросе переопределяет дефолтную. Позволяет задать порядок (`order`), включить/выключить фоллбэки (`allow_fallbacks`), игнорировать провайдеров (`ignore`), требовать поддержку параметров (`require_parameters`), фильтровать по политике данных (`data_collection`) или квантизации (`quantizations`), сортировать (`sort`).

#### 🌐 Веб-поиск

*   **Активация:**
    *   Добавьте суффикс `:online` к имени модели в `options.model` (например, `'openai/gpt-4o-mini:online'`).
    *   Или передайте плагин в `options.plugins`: `plugins: [{ id: 'web' }]`. Можно также настроить `max_results` и `search_prompt`: `plugins: [{ id: 'web', max_results: 3 }]`.
*   **Результат:** Финальный ответ модели может содержать результаты веб-поиска. Ссылки на источники будут доступны в поле `ChatCompletionResult.annotations`.

#### 🤔 Токены Рассуждений (Reasoning Tokens)

*   **Запрос:** Передайте объект `reasoning` в `options` метода `client.chat()`.
    *   `effort`: `'low'`, `'medium'` или `'high'`.
    *   `max_tokens`: Число токенов для рассуждений.
    *   `exclude`: `true`, чтобы модель рассуждала, но не включала это в ответ.
*   **Результат:** Шаги рассуждений будут доступны в поле `ChatCompletionResult.reasoning` (если `exclude: false`).

#### ⚙️ Формат ответа (`responseFormat` и Structured Outputs)

Запросите ответ в формате JSON, чтобы упростить парсинг и обработку данных.

*   **Конфигурация:** Опция `responseFormat` в `OpenRouterConfig` (для установки по умолчанию) или `OpenRouterRequestOptions` (для конкретного запроса).
*   **Типы:**
    *   `{ type: 'json_object' }`: Модель должна вернуть любой валидный JSON объект.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Модель должна вернуть JSON, соответствующий вашей JSON Schema.
*   **Обработка ошибок парсинга:** Если модель возвращает невалидный JSON, поведение зависит от настройки `strictJsonParsing` (в `OpenRouterConfig` или `OpenRouterRequestOptions`).
*   **⚠️ Предупреждение о совместимости с `tools`:** Не все модели поддерживают одновременное использование `responseFormat` и `tools`. Проверяйте документацию OpenRouter или экспериментируйте.

#### ⚠️ Обработка ошибок

Используйте `try...catch` и проверяйте ошибки через `instanceof` или `error.code` (`ErrorCode`). Подписывайтесь на событие `'error'` клиента для глобального логирования.

#### 📝 Логирование

Включается через `debug: true`. Использует `console` с префиксами компонентов.

#### 🌐 Прокси

Настраивается через опцию `proxy` (URL строка или объект `{ host, port, user?, pass? }`) в `OpenRouterConfig`.


### 📄 Лицензия

[MIT](./LICENSE)