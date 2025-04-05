# OpenRouter Kit

[![Версия npm](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![Лицензия: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.en.md)
---

**OpenRouter Kit** — это мощная, гибкая и удобная TypeScript/JavaScript библиотека для взаимодействия с [OpenRouter API](https://openrouter.ai/). Она значительно упрощает работу с LLM, предоставляя высокоуровневый API для чатов, автоматическое управление историей диалогов (**при конфигурации адаптера**), бесшовную обработку вызовов инструментов (function calling), надежный и настраиваемый модуль безопасности, а также опциональное отслеживание стоимости запросов. Идеально подходит для создания чат-ботов, ИИ-агентов и интеграции LLM в ваши приложения.

## Зачем использовать OpenRouter Kit?

*   **Простота:** Сложные взаимодействия с API, управление историей и обработка инструментов скрыты за простым методом `client.chat()`.
*   **Гибкость:** Настраивайте модели, параметры генерации, **хранение истории (требует адаптер)**, безопасность и многое другое.
*   **Безопасность:** Встроенный модуль безопасности помогает защитить ваши приложения и пользователей при использовании инструментов.
*   **Расширяемость:** Используйте плагины и middleware для добавления пользовательской логики без изменения ядра библиотеки.
*   **Надежность:** Полная типизация на TypeScript, предсказуемая обработка ошибок и управление ресурсами.

## 📚 Содержание

*   [🚀 Ключевые возможности](#-ключевые-возможности)
*   [📦 Установка](#-установка)
*   [✨ Базовое использование](#-базовое-использование)
*   [🚕 Пример: Такси-бот](#-пример-такси-бот)
*   [⚙️ API и Концепции](#️-api-и-концепции)
    *   [OpenRouterClient](#openrouterclient)
        *   [Конфигурация (OpenRouterConfig)](#конфигурация-openrouterconfig)
        *   [Основные методы](#основные-методы)
    *   [Плагины и Middleware](#-плагины-и-middleware)
    *   [Управление историей (Адаптеры)](#-управление-историей-адаптеры)
    *   [Обработка инструментов (Function Calling)](#-обработка-инструментов-function-calling)
    *   [Модуль безопасности (SecurityManager)](#-модуль-безопасности-securitymanager)
    *   [Отслеживание стоимости (Cost Tracking)](#-отслеживание-стоимости-cost-tracking)
    *   [Формат ответа (responseFormat)](#️-формат-ответа-responseformat)
    *   [Обработка ошибок](#️-обработка-ошибок)
    *   [Логирование](#-логирование)
    *   [Прокси](#-прокси)
*   [📄 Лицензия](#-лицензия)

## 🚀 Ключевые возможности

*   **🤖 Универсальный чат:** Простой и мощный API (`client.chat`) для взаимодействия с любой моделью, доступной через OpenRouter.
    *   Возвращает структурированный объект `ChatCompletionResult` с контентом (`content`), информацией об использованных токенах (`usage`), моделью (`model`), количеством вызовов инструментов (`toolCallsCount`), причиной завершения (`finishReason`), временем выполнения (`durationMs`), ID запроса (`id`) и **рассчитанной стоимостью** (`cost`, опционально).
*   **📜 Управление историей:** **Требует конфигурации `historyAdapter`**. Автоматическая загрузка, сохранение и обрезка истории диалогов для каждого пользователя или группы, если передан `user` в `client.chat()`.
    *   Гибкая система истории на базе **адаптеров** (`IHistoryStorage`).
    *   В комплекте — адаптеры для памяти (`MemoryHistoryStorage`) и диска (`DiskHistoryStorage`, JSON-файлы).
    *   Легко подключать свои адаптеры (Redis, MongoDB, API и др.) или использовать готовый плагин (`createRedisHistoryPlugin`).
    *   Настройка TTL, лимитов, интервалов очистки через опции клиента.
*   **🛠️ Обработка инструментов (Function Calling):** Бесшовная интеграция вызова ваших функций моделью.
    *   Определение инструментов с помощью `Tool` интерфейса и JSON Schema для валидации аргументов.
    *   Автоматический парсинг аргументов, валидация по схеме и **проверка безопасности**.
    *   Выполнение ваших `execute` функций с передачей контекста (`ToolContext`, включая `userInfo`).
    *   Автоматическая отправка результатов обратно модели для получения финального ответа.
    *   Настраиваемый лимит на максимальное количество раундов вызова инструментов (`maxToolCalls`) для предотвращения зацикливания.
*   **🛡️ Модуль безопасности:** Комплексная и настраиваемая защита для ваших приложений.
    *   **Аутентификация:** Встроенная поддержка JWT (генерация, валидация, кэширование) через `AuthManager`. Легко расширяется для других методов (`api-key`, `custom`).
    *   **Контроль доступа (ACL):** Гибкая настройка доступа к инструментам (`AccessControlManager`) на основе ролей (`roles`), API-ключей (`allowedApiKeys`), разрешений (`scopes`) или явных правил (`allow`/`deny`). Политика по умолчанию (`deny-all`/`allow-all`).
    *   **Ограничение частоты (Rate Limiting):** Применение лимитов (`RateLimitManager`) на вызовы инструментов для пользователей или ролей, настраиваемые периоды и лимиты.
    *   **Санитизация аргументов:** Проверка (`ArgumentSanitizer`) аргументов инструментов на наличие потенциально опасных паттернов (SQLi, XSS, command injection и т.д.) с глобальными, специфичными для инструмента и пользовательскими правилами. Поддержка режима аудита (`auditOnlyMode`).
    *   **Система событий:** Подписка на события безопасности (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, `token:invalid`, `user:authenticated` и др.) для мониторинга и логирования.
*   **📈 Отслеживание стоимости (Cost Tracking):** (Опционально)
    *   Автоматический расчет примерной стоимости каждого вызова `chat()` на основе данных об использованных токенах (`usage`) и цен моделей OpenRouter.
    *   Периодическое фоновое обновление цен моделей из API OpenRouter (`/models`).
    *   Метод `getCreditBalance()` для проверки текущего баланса кредитов OpenRouter.
    *   Доступ к закэшированным ценам через `getModelPrices()`.
*   **⚙️ Гибкая конфигурация:** Настройка API ключа, модели по умолчанию, эндпоинта, таймаутов, **прокси**, заголовков (`Referer`, `X-Title`), резервных моделей (`modelFallbacks`), формата ответа (`responseFormat`), лимита вызова инструментов (`maxToolCalls`), отслеживания стоимости (`enableCostTracking`), **адаптера истории (`historyAdapter`)** и многих других параметров через `OpenRouterConfig`.
*   **💡 Типизация:** Полностью написан на TypeScript, обеспечивая строгую типизацию, автодополнение и проверку типов во время разработки.
*   **🚦 Обработка ошибок:** Понятная иерархия кастомных ошибок (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, `ToolError`, `ConfigError` и др.), наследуемых от `OpenRouterError`, с кодами (`ErrorCode`) и деталями для удобной обработки. Функция `mapError` для нормализации ошибок.
*   **📝 Логирование:** Встроенный гибкий логгер (`Logger`) с поддержкой префиксов и режима отладки (`debug`).
*   **✨ Простота использования:** Высокоуровневый API, скрывающий сложность базовых взаимодействий с LLM, историей и инструментами.
*   **🧹 Управление ресурсами:** Метод `client.destroy()` для корректного освобождения ресурсов (таймеры очистки, кэши, обработчики событий), предотвращая утечки в долгоживущих приложениях.
*   **🧩 Плагин-система:** Расширяйте возможности клиента без изменения ядра.
    *   Поддержка подключения внешних и кастомных плагинов через `client.use(plugin)`.
    *   Плагины могут добавлять middleware, заменять менеджеры (истории, безопасности, стоимости), подписываться на события и расширять API клиента.
*   **🔗 Middleware-цепочка:** Гибкая обработка запросов и ответов перед и после вызова API.
    *   Добавляйте middleware-функции через `client.useMiddleware(fn)`.
    *   Middleware может модифицировать запросы (`ctx.request`), ответы (`ctx.response`), реализовать аудит, контроль доступа, логирование, ограничение стоимости, кэширование и многое другое.

## 📦 Установка

```bash
npm install openrouter-kit
# или
yarn add openrouter-kit
# или
pnpm add openrouter-kit
```

## ✨ Базовое использование

**TypeScript:**

```typescript
import OpenRouter from 'openrouter-kit';
// !!! ВАЖНО: Импортируем адаптер для истории !!!
// Используйте правильный путь в зависимости от структуры вашего 'dist'
// или экспорта из основного index.ts библиотеки
import { MemoryHistoryStorage } from 'openrouter-kit/dist/history/memory-storage';
// Либо, если вы экспортировали его из index.ts:
// import { MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // !!! ВАЖНО: Предоставляем адаптер для включения истории !!!
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true,
  debug: false,
});

async function main() {
  try {
    console.log('Отправка запроса...');
    const result = await client.chat({
      prompt: 'Передай привет миру!',
      model: 'google/gemini-2.0-flash-001',
      user: 'test-user-1', // ID пользователя для сохранения истории
    });

    console.log('--- Результат ---');
    console.log('Ответ модели:', result.content);
    console.log('Использовано токенов:', result.usage);
    console.log('Использованная модель:', result.model);
    console.log('Количество вызовов инструментов:', result.toolCallsCount);
    console.log('Причина завершения:', result.finishReason);
    console.log('Время выполнения (мс):', result.durationMs);
    if (result.cost !== null) {
      console.log('Примерная стоимость (USD):', result.cost.toFixed(8));
    }
    console.log('ID Запроса:', result.id);

    console.log('\nПроверка баланса...');
    const balance = await client.getCreditBalance();
    console.log(`Баланс кредитов: использовано $${balance.usage.toFixed(4)} из $${balance.limit.toFixed(2)}`);

    // Получение истории (сработает, т.к. historyAdapter был предоставлен)
    const historyManager = client.getHistoryManager();
    if (historyManager) {
        const historyKey = `user:test-user-1`; // Пример ключа
        const history = await historyManager.getHistory(historyKey);
        console.log(`\nСохранено сообщений в истории для ${historyKey}: ${history.length}`);
    }

  } catch (error: any) {
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
    if (error.code) console.error(`Код ошибки: ${error.code}`);
    if (error.statusCode) console.error(`HTTP Статус: ${error.statusCode}`);
    if (error.details) console.error(`Детали:`, error.details);
    // console.error(error.stack);
  } finally {
    console.log('\nЗавершение работы и освобождение ресурсов...');
    await client.destroy();
    console.log('Ресурсы освобождены.');
  }
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit");
// !!! ВАЖНО: Импортируем адаптер для истории из его файла !!!
const { MemoryHistoryStorage } = require("openrouter-kit/dist/history/memory-storage");
// Либо, если вы экспортировали его из index.js:
// const { MemoryHistoryStorage } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // !!! ВАЖНО: Предоставляем адаптер для включения истории !!!
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true,
});

async function main() {
  try {
    const result = await client.chat({
        prompt: 'Hello, world!',
        user: 'commonjs-user' // Указываем user для сохранения истории
    });
    console.log('Ответ модели:', result.content);
    console.log('Использование:', result.usage);
    console.log('Стоимость:', result.cost);

    // Получение истории
    const historyManager = client.getHistoryManager();
    if (historyManager) {
        const history = await historyManager.getHistory('user:commonjs-user'); // Ключ формируется внутренне
        console.log(`\nИстория для 'user:commonjs-user': ${history.length} сообщений`);
    }

  } catch (error) {
     console.error(`Ошибка: ${error.message}`, error.details || error);
  } finally {
     await client.destroy();
  }
}

main();
```

## 🚕 Пример: Такси-бот

Этот пример демонстрирует использование истории диалогов и вызова инструментов. **Обратите внимание на обязательное добавление `historyAdapter` и соответствующий `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");
// !!! ВАЖНО: Импортируем MemoryHistoryStorage напрямую !!!
const { MemoryHistoryStorage } = require("openrouter-kit/dist/history/memory-storage");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Пример конфигурации прокси (если нужно)
// const proxyConfig = {
//   host: "",
//   port: "",
//   user: "",
//   pass: "",
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...", // Замените!
  model: "google/gemini-2.0-flash-001",
  // !!! ВАЖНО: Предоставляем адаптер для использования истории !!!
  historyAdapter: new MemoryHistoryStorage(),
//  proxy: proxyConfig,
  enableCostTracking: true,
  debug: false,
  // security: { /* ... */ }
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
      // Передаем user: userId, история будет управляться автоматически,
      // так как historyAdapter был предоставлен
      const result = await client.chat({
        user: userId,
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools,
        temperature: 0.5,
        maxToolCalls: 5
      });

      console.log(`\nБот Кит: ${result.content}\n`);

      if (client.isDebugMode()) {
          console.log(`[Отладка] Модель: ${result.model}, Вызовы инстр.: ${result.toolCallsCount}, Стоимость: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Причина: ${result.finishReason}`);
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
        if (error.code) console.error(`Код: ${error.code}`);
        if (error.statusCode) console.error(`Статус: ${error.statusCode}`);
        if (error.details) console.error(`Детали:`, error.details);
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

## ⚙️ API и Концепции

### `OpenRouterClient`

Основной класс для взаимодействия с библиотекой.

#### Конфигурация (`OpenRouterConfig`)

При создании клиента (`new OpenRouterClient(config)`) передается объект конфигурации. Ключевые поля описаны выше. **Важно:** для использования истории необходимо указать `historyAdapter`.

#### Основные методы

Описаны выше. Метод `chat` будет управлять историей только если передан `user` **и** в конфигурации клиента указан `historyAdapter`.

### 🧩 Плагины и Middleware

Описаны выше. Позволяют расширять функциональность.

### 📜 Управление историей (Адаптеры)

Для автоматического управления историей диалогов (загрузка, сохранение, обрезка при передаче `user` в `client.chat()`), **необходимо сконфигурировать `historyAdapter`** в `OpenRouterConfig`. Без него функционал истории работать не будет.

*   **Адаптер (`IHistoryStorage`):** Определяет интерфейс для хранилища (`load`, `save`, `delete`, `listKeys`).
*   **Встроенные адаптеры:**
    *   `MemoryHistoryStorage`: Хранит историю в оперативной памяти.
        ```typescript
        // TypeScript Import
        import { MemoryHistoryStorage } from 'openrouter-kit/dist/history/memory-storage';
        // CommonJS Require
        // const { MemoryHistoryStorage } = require('openrouter-kit/dist/history/memory-storage');

        const client = new OpenRouter({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
        ```
    *   `DiskHistoryStorage`: Хранит историю в JSON-файлах на диске.
        ```typescript
        // TypeScript Import
        import { DiskHistoryStorage } from 'openrouter-kit/dist/history/disk-storage';
        // CommonJS Require
        // const { DiskHistoryStorage } = require('openrouter-kit/dist/history/disk-storage');

        const client = new OpenRouter({ /*...,*/ historyAdapter: new DiskHistoryStorage('./my-chats') });
        ```
    *   **Примечание:** Пути для `import`/`require` могут измениться, если вы реорганизуете экспорт в библиотеке.
*   **Плагин для Redis:** Используйте `createRedisHistoryPlugin` для удобной интеграции с Redis (требует `ioredis`).
*   **Настройки:** `maxHistoryEntries`, `historyTtl`, `historyCleanupInterval` управляют поведением `UnifiedHistoryManager`, который использует предоставленный адаптер.

### 🛠️ Обработка инструментов (Function Calling)

Эта функция позволяет моделям LLM вызывать ваши собственные функции JavaScript/TypeScript для получения внешней информации, взаимодействия с другими API или выполнения действий в реальном мире.

1.  **Определение Инструмента (`Tool`):**
    Вы определяете каждый инструмент как объект, соответствующий интерфейсу `Tool`. Основные поля:
    *   `type: 'function'` (пока единственный поддерживаемый тип).
    *   `function`: Объект, описывающий функцию для LLM:
        *   `name` (string): Уникальное имя функции, которое модель будет использовать для вызова.
        *   `description` (string, опционально): Четкое описание того, что делает функция и когда ее следует использовать. Это **очень важно** для того, чтобы модель правильно понимала назначение инструмента.
        *   `parameters` (object, опционально): [JSON Schema](https://json-schema.org/), описывающая структуру, типы и обязательные поля аргументов, которые ожидает ваша функция. Библиотека использует эту схему для валидации аргументов, полученных от модели. Если аргументы не нужны, это поле можно опустить.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Ваша асинхронная или синхронная функция**, которая будет выполнена, когда модель запросит вызов этого инструмента.
        *   `args`: Объект с аргументами, переданными моделью, уже распарсенными из JSON-строки и (если схема предоставлена) провалидированными по `parameters`.
        *   `context?`: Опциональный объект `ToolContext`, содержащий дополнительную информацию о вызове, например:
            *   `userInfo?`: Объект `UserAuthInfo` с данными аутентифицированного пользователя (если используется `SecurityManager` и передан `accessToken`).
            *   `securityManager?`: Экземпляр `SecurityManager` (если используется).
    *   `security` (ToolSecurity, опционально): Объект для определения специфичных для этого инструмента правил безопасности, таких как `requiredRole`, `requiredScopes` или `rateLimit`. Эти правила проверяются `SecurityManager` перед вызовом `execute`.

2.  **Использование в `client.chat()`:**
    *   Передайте массив ваших определенных инструментов в опцию `tools` метода `client.chat()`.
    *   Библиотека берет на себя весь сложный процесс взаимодействия:
        1.  Отправляет определения инструментов (имя, описание, схема параметров) модели вместе с вашим запросом.
        2.  Если модель решает, что для ответа нужно вызвать один или несколько инструментов, она вернет ответ с `finish_reason: 'tool_calls'` и списком `tool_calls`.
        3.  Библиотека перехватывает этот ответ. Для каждого запрошенного вызова (`toolCall`):
            *   Находит соответствующий инструмент в вашем массиве `tools` по имени.
            *   Парсит строку с аргументами (`toolCall.function.arguments`) в JavaScript-объект.
            *   Валидирует полученный объект аргументов по JSON Schema, указанной в `tool.function.parameters` (если она есть).
            *   **Выполняет проверки безопасности** через `SecurityManager` (если он сконфигурирован): проверяет права доступа пользователя (`userInfo`) к этому инструменту, применяет rate-лимиты и проверяет аргументы на опасное содержимое.
            *   Если все проверки пройдены, вызывает вашу функцию `tool.execute(parsedArgs, context)`.
            *   Дожидается результата (или ловит ошибку) от вашей функции `execute`.
            *   Форматирует результат (или информацию об ошибке) и отправляет его обратно модели в новом сообщении с `role: 'tool'` и `tool_call_id`.
        4.  Модель получает результаты вызова инструментов и генерирует финальный, осмысленный ответ пользователю (уже с `role: 'assistant'`).
    *   Опция `maxToolCalls` в `client.chat()` или конфигурации клиента ограничивает максимальное количество таких циклов "запрос-вызов-результат", чтобы предотвратить зацикливание, если модель будет постоянно запрашивать инструменты.
    *   Опция `toolChoice` позволяет управлять выбором инструментов моделью: `'auto'` (по умолчанию), `'none'` (запретить вызов), или принудительно вызвать конкретную функцию `{ type: "function", function: { name: "my_tool_name" } }`.

3.  **Результат:** Финальный ответ модели (после всех возможных вызовов инструментов) будет доступен в поле `ChatCompletionResult.content`. Поле `ChatCompletionResult.toolCallsCount` покажет, сколько раз инструменты были успешно вызваны и выполнены в рамках одного вызова `client.chat()`.

### 🔒 Модуль безопасности (`SecurityManager`)

Обеспечивает многоуровневую защиту при использовании инструментов, что особенно важно, если инструменты могут выполнять действия или получать доступ к данным. Активируется передачей объекта `security: SecurityConfig` в конструктор `OpenRouterClient`.

**Компоненты:**

*   `AuthManager`: Отвечает за аутентификацию пользователей. По умолчанию поддерживает JWT. Генерирует (`createAccessToken`) и валидирует (`authenticateUser`) токены. Использует `jwtSecret` из конфигурации. Может быть расширен для поддержки других методов через `customAuthenticator`.
*   `AccessControlManager`: Проверяет, имеет ли аутентифицированный пользователь (или анонимный пользователь, если разрешено) право вызывать конкретный инструмент. Использует правила из `security.toolAccess` и `security.roles`. Учитывает `defaultPolicy`.
*   `RateLimitManager`: Отслеживает и применяет лимиты на частоту вызовов инструментов для каждого пользователя. Находит релевантный лимит в конфигурации (`security.roles`, `security.toolAccess` или `tool.security`).
*   `ArgumentSanitizer`: Анализирует аргументы, передаваемые в `execute` функции инструментов, на наличие потенциально опасных строк или паттернов (например, попытки SQL-инъекций, XSS, команд ОС). Использует регулярные выражения и списки запрещенных строк из `security.dangerousArguments`. Может работать в режиме блокировки или только аудита (`auditOnlyMode`).

**Конфигурация (`SecurityConfig`):**

Детально определяет поведение модуля безопасности. Ключевые поля:

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): Что делать, если для инструмента нет явного правила доступа? Рекомендуется `'deny-all'`.
*   `requireAuthentication` (boolean): Требовать ли валидный `accessToken` для *любого* вызова инструмента?
*   `allowUnauthenticatedAccess` (boolean): Если `requireAuthentication: false`, разрешать ли вызов инструментов анонимным пользователям (если для инструмента задано `allow: true` без указания ролей/scopes)?
*   `userAuthentication` (`UserAuthConfig`): Настройка способа аутентификации (`type: 'jwt'`, `jwtSecret`, `customAuthenticator`). **Критически важно задать надежный `jwtSecret`, если используется JWT!**
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Правила доступа для конкретных инструментов (по имени) или для всех (`'*'`). Включает `allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`.
*   `roles` (`RolesConfig`): Определение ролей и их привилегий (`allowedTools`, `rateLimits`).
*   `dangerousArguments` (`DangerousArgumentsConfig`): Настройка санитизации аргументов (`globalPatterns`, `toolSpecificPatterns`, `blockedValues`, `auditOnlyMode`).

**Использование:**

1.  Передайте объект `securityConfig` в конструктор `OpenRouterClient`.
2.  Для аутентифицированных запросов передавайте токен доступа в `client.chat({ accessToken: '...' })`.
3.  При вызове инструмента библиотека автоматически вызовет `securityManager.checkToolAccessAndArgs()`, который выполнит все необходимые проверки (аутентификация, авторизация, лимиты, аргументы).
4.  При нарушении правил будет выброшена соответствующая ошибка (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`), и вызов `execute` не произойдет.
5.  Используйте `client.createAccessToken()` для генерации JWT (если настроено).
6.  Подписывайтесь на события безопасности (`client.on('access:denied', ...)` и др.) для мониторинга и реагирования.

### 📈 Отслеживание стоимости (Cost Tracking)

Позволяет получать **приблизительную** оценку стоимости каждого вызова `client.chat()` на основе данных об использовании токенов и цен на модели OpenRouter.

*   **Включение:** Установите `enableCostTracking: true` в `OpenRouterConfig`.
*   **Механизм:**
    1.  При инициализации клиента создается экземпляр `CostTracker`.
    2.  `CostTracker` запрашивает актуальные цены для всех доступных моделей с эндпоинта OpenRouter API `/models`. Это происходит при старте (если не заданы `initialModelPrices`) и затем периодически (интервал задается `priceRefreshIntervalMs`, по умолчанию 6 часов).
    3.  Полученные цены (стоимость за миллион входных и выходных токенов) кэшируются в памяти.
    4.  После каждого успешного вызова `client.chat()`, библиотека получает информацию об использованных токенах (`usage`) из ответа API.
    5.  Вызывается `costTracker.calculateCost(model, usage)`, который использует закэшированные цены для использованной модели и данные `usage` для расчета стоимости. Учитываются токены как промпта, так и ответа, а также токены, потраченные во время вызовов инструментов (если они были).
    6.  Рассчитанное значение (число в долларах США) или `null` (если цены для модели неизвестны или отслеживание выключено) добавляется в поле `cost` возвращаемого объекта `ChatCompletionResult`.
*   **Связанные методы клиента:**
    *   `getCreditBalance(): Promise<CreditBalance>`: Запрашивает актуальный лимит и использование кредитов с вашего аккаунта OpenRouter.
    *   `getModelPrices(): Record<string, ModelPricingInfo>`: Возвращает текущий кэш цен моделей, используемый трекером.
    *   `refreshModelPrices(): Promise<void>`: Принудительно запускает фоновое обновление кэша цен моделей.
    *   `getCostTracker(): CostTracker | null`: Дает доступ к экземпляру `CostTracker` (если он включен).
*   **Точность:** Следует помнить, что это **оценка**. Реальная стоимость может незначительно отличаться из-за округлений или изменений в ценовой политике OpenRouter, не отраженных в кэше.

### ⚙️ Формат ответа (`responseFormat`)

Позволяет указать модели, что ответ должен быть сгенерирован в формате JSON. Это может быть полезно для получения структурированных данных.

*   **Конфигурация:** Задается через опцию `responseFormat` в `OpenRouterConfig` (для ответа по умолчанию) или в `options` метода `client.chat()` (для конкретного запроса).
*   **Типы:**
    *   `{ type: 'json_object' }`: Указывает модели вернуть любой валидный JSON-объект.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Требует от модели вернуть JSON, соответствующий предоставленной JSON Schema.
        *   `name`: Произвольное имя для вашей схемы.
        *   `schema`: Объект JSON Schema, описывающий структуру ожидаемого JSON.
        *   `strict` (опционально): Требовать строгого соответствия схеме (если поддерживается моделью).
        *   `description` (опционально): Описание схемы для модели.
*   **Пример:**
    ```typescript
    const userSchema = {
      type: "object",
      properties: { name: { type: "string"}, age: {type: "number"} },
      required: ["name", "age"]
    };
    const result = await client.chat({
      prompt: 'Сгенерируй JSON для пользователя: имя Алиса, возраст 30.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      }
    });
    // result.content будет содержать объект { name: "Алиса", age: 30 } или null/ошибку
    ```
*   **Обработка ошибок парсинга:**
    *   Если опция клиента `strictJsonParsing: false` (по умолчанию): В случае, если модель возвращает невалидный JSON или JSON, не соответствующий схеме, поле `ChatCompletionResult.content` будет `null`.
    *   Если опция клиента `strictJsonParsing: true`: В аналогичной ситуации будет выброшена ошибка `ValidationError`.
*   **Поддержка моделями:** Не все модели гарантированно поддерживают `responseFormat`. Проверяйте документацию конкретной модели.

### ⚠️ Обработка ошибок

Библиотека предоставляет структурированную систему обработки ошибок для упрощения отладки и управления потоком выполнения.

*   **Базовый класс `OpenRouterError`**: Все ошибки библиотеки наследуются от него. Содержит:
    *   `message`: Человекочитаемое описание ошибки.
    *   `code` (`ErrorCode`): Строковый код для программной идентификации типа ошибки (например, `API_ERROR`, `VALIDATION_ERROR`, `RATE_LIMIT_ERROR`).
    *   `statusCode?` (number): HTTP статус код ответа API, если применимо.
    *   `details?` (any): Дополнительные данные или оригинальная ошибка.
*   **Подклассы**: Для специфичных ситуаций используются подклассы, такие как:
    *   `APIError`: Ошибка, возвращенная API OpenRouter (статус >= 400).
    *   `ValidationError`: Ошибка валидации данных (конфиг, аргументы, ответ JSON/схема).
    *   `NetworkError`: Сетевая проблема при соединении с API.
    *   `AuthenticationError`: Проблема с API ключом (обычно 401).
    *   `AuthorizationError`: Невалидный или просроченный токен доступа (обычно 401).
    *   `AccessDeniedError`: Пользователь аутентифицирован, но не имеет прав (обычно 403).
    *   `RateLimitError`: Превышен лимит запросов (обычно 429). Содержит `details.timeLeft` (ms).
    *   `ToolError`: Ошибка во время выполнения `execute` функции инструмента.
    *   `ConfigError`: Некорректная конфигурация библиотеки.
    *   `SecurityError`: Общая ошибка безопасности (включая `DANGEROUS_ARGS`).
    *   `TimeoutError`: Превышено время ожидания ответа от API.
*   **Перечисление `ErrorCode`**: Содержит все возможные строковые коды ошибок (`ErrorCode.API_ERROR`, `ErrorCode.TOOL_ERROR` и т.д.).
*   **Функция `mapError(error)`**: Внутренне используется для преобразования ошибок Axios и стандартных `Error` в `OpenRouterError`. Экспортируется для возможного использования.
*   **Рекомендации по обработке**:
    *   Используйте блоки `try...catch` вокруг вызовов методов клиента (`client.chat()`, `client.getCreditBalance()` и др.).
    *   Проверяйте тип ошибки через `instanceof` (например, `if (error instanceof RateLimitError)`) или по коду (`if (error.code === ErrorCode.VALIDATION_ERROR)`).
    *   Анализируйте `error.statusCode` и `error.details` для получения контекста.
    *   Подписывайтесь на глобальное событие `'error'` клиента (`client.on('error', handler)`) для централизованного логирования или отслеживания непредвиденных ошибок.

```typescript
import { OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

try {
  // ... вызов client.chat() ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 1000) / 1000); // Секунды
    console.warn(`Превышен лимит запросов! Попробуйте снова через ${retryAfter} сек.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Ошибка валидации: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.TOOL_ERROR && error.message.includes('Maximum tool call depth')) {
     console.error(`Достигнут лимит вызовов инструментов: ${error.message}`);
  } else if (error instanceof OpenRouterError) {
    console.error(`Ошибка OpenRouter Kit (${error.code}, Status: ${error.statusCode || 'N/A'}): ${error.message}`);
    if(error.details) console.error('Детали:', error.details);
  } else {
    console.error(`Неизвестная ошибка: ${error.message}`);
  }
}
```

### 📝 Логирование

Библиотека использует встроенный логгер для вывода отладочной информации и сообщений о событиях.

*   **Активация:** Установите `debug: true` в `OpenRouterConfig` при создании клиента.
*   **Уровни:** Используются стандартные уровни консоли: `console.debug`, `console.log`, `console.warn`, `console.error`. В режиме `debug: false` выводятся только критические предупреждения или ошибки, возникающие при инициализации.
*   **Префиксы:** Сообщения автоматически снабжаются префиксами, указывающими на компонент библиотеки (например, `[OpenRouterClient]`, `[SecurityManager]`, `[CostTracker]`, `[HistoryManager]`), что облегчает отладку.
*   **Кастомизация:** Хотя напрямую замена логгера не предусмотрена стандартным API, вы можете передать свой логгер в некоторые компоненты (например, `HistoryManager`, если он создается вручную) или использовать плагины/middleware для перехвата и перенаправления логов.
*   **Метод `isDebugMode()`:** Позволяет проверить текущее состояние режима отладки клиента (`client.isDebugMode()`).

### 🌐 Прокси

Для маршрутизации запросов к OpenRouter API через HTTP/HTTPS прокси, используйте опцию `proxy` в `OpenRouterConfig`.

*   **Форматы:**
    *   **URL Строка:** Полный URL прокси, включая протокол, опционально аутентификацию, хост и порт.
        ```typescript
        proxy: 'http://user:password@proxy.example.com:8080'
        ```
        ```typescript
        proxy: 'https://secureproxy.com:9000'
        ```
    *   **Объект:** Структурированный объект с полями:
        *   `host` (string, **обязательно**): Хост прокси-сервера.
        *   `port` (number | string, **обязательно**): Порт прокси-сервера.
        *   `user?` (string, опционально): Имя пользователя для аутентификации на прокси.
        *   `pass?` (string, опционально): Пароль для аутентификации на прокси.
        ```typescript
        proxy: {
          host: '192.168.1.100',
          port: 8888, // может быть и строкой '8888'
          user: 'proxyUser',
          pass: 'proxyPassword'
        }
        ```
*   **Механизм:** Библиотека использует `https-proxy-agent` для маршрутизации HTTPS-трафика через указанный HTTP/HTTPS прокси.

## 📄 Лицензия

[MIT](./LICENSE)