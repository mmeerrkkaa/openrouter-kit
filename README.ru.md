# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.md)
---

**OpenRouter Kit** — это мощная и удобная TypeScript/JavaScript библиотека для работы с [OpenRouter API](https://openrouter.ai/). Она упрощает отправку запросов к LLM, автоматически управляет историей диалогов, обрабатывает вызовы инструментов (function calling), предоставляет надежный модуль безопасности и позволяет отслеживать стоимость запросов.

## 🚀 Ключевые возможности

*   **🤖 Универсальный чат:** Простой API (`client.chat`) для взаимодействия с любой моделью, доступной через OpenRouter.
    *   Возвращает структурированный объект `ChatCompletionResult` с контентом (`content`), информацией об использованных токенах (`usage`), моделью (`model`), количеством вызовов инструментов (`toolCallsCount`), причиной завершения (`finishReason`), временем выполнения (`durationMs`), ID запроса (`id`) и **рассчитанной стоимостью** (`cost`, опционально).
*   **📜 Управление историей:** Автоматическая загрузка, сохранение и обрезка истории диалогов для каждого пользователя или группы.
    *   Гибкая система истории на базе **адаптеров** (`IHistoryStorage`).
    *   В комплекте — адаптеры для памяти и диска (JSON-файлы).
    *   Можно подключать свои адаптеры (Redis, Mongo, API и др.).
*   **🛠️ Обработка инструментов (Function Calling):** Бесшовная интеграция вызова ваших функций моделью.
    *   Определение инструментов с JSON Schema для валидации аргументов.
    *   Автоматический парсинг, валидация схемы и **проверка безопасности** аргументов.
    *   Выполнение ваших `execute` функций с передачей контекста (включая `userInfo`).
    *   Автоматическая отправка результатов обратно модели для получения финального ответа.
    *   Настраиваемый лимит на максимальное количество раундов вызова инструментов (`maxToolCalls`) для предотвращения зацикливания.
*   **🛡️ Модуль безопасности:** Комплексная защита для ваших приложений.
    *   **Аутентификация:** Встроенная поддержка JWT (генерация, валидация, кэширование). Легко расширяется для других методов.
    *   **Контроль доступа (ACL):** Гибкая настройка доступа к инструментам на основе ролей, API-ключей, разрешений (scopes) или явных правил (`allow`/`deny`).
    *   **Ограничение частоты (Rate Limiting):** Применение лимитов на вызовы инструментов для пользователей или ролей.
    *   **Санитизация аргументов:** Проверка аргументов инструментов на наличие потенциально опасных паттернов (SQLi, XSS, command injection и т.д.) с возможностью настройки и режима аудита.
    *   **Система событий:** Подписка на события безопасности (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args` и др.) для мониторинга и логирования.
*   **📈 Отслеживание стоимости (Cost Tracking):** (Опционально)
    *   Автоматический расчет примерной стоимости каждого вызова `chat` на основе данных об использованных токенах и ценах моделей OpenRouter.
    *   Периодическое обновление цен моделей из API OpenRouter.
    *   Метод `getCreditBalance()` для проверки текущего баланса кредитов.
*   **⚙️ Гибкая конфигурация:** Настройка API ключа, модели по умолчанию, эндпоинта, таймаутов, **прокси**, заголовков (`Referer`, `X-Title`), резервных моделей (`modelFallbacks`), формата ответа (`responseFormat`), лимита вызова инструментов (`maxToolCalls`), отслеживания стоимости (`enableCostTracking`) и др.
*   **💡 Типизация:** Полностью написан на TypeScript, обеспечивая автодополнение и проверку типов.
*   **🚦 Обработка ошибок:** Понятная иерархия кастомных ошибок (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError` и т.д.) с кодами и деталями.
*   **📝 Логирование:** Встроенный гибкий логгер с поддержкой префиксов и режима отладки.
*   **✨ Простота использования:** Высокоуровневый API, скрывающий сложность взаимодействия с LLM и инструментами.
*   **🧹 Управление ресурсами:** Метод `destroy()` для корректного освобождения ресурсов (таймеры, кэши, обработчики) в долгоживущих приложениях.
*   **🧩 Плагин-система:** Расширяйте возможности клиента без изменения ядра.
    *   Поддержка подключения внешних и кастомных плагинов через `client.use(plugin)`.
    *   Плагины могут добавлять middleware, заменять менеджеры, подписываться на события и расширять API.
*   **🔗 Middleware-цепочка:** Гибкая обработка запросов и ответов.
    *   Добавляйте middleware-функции через `client.useMiddleware(fn)`.
    *   Middleware может модифицировать запросы, ответы, реализовать аудит, контроль доступа, логирование, ограничение стоимости и др.

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

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  enableCostTracking: true, // Опционально: включить расчет стоимости
});

async function main() {
  try {
    const result = await client.chat({ // Получаем объект ChatCompletionResult
      prompt: 'Передай привет!',
      model: 'google/gemini-2.0-flash-001', // Опционально переопределяем модель
    });

    console.log('Ответ модели:', result.content); // Доступ к контенту через .content
    console.log('Использовано токенов:', result.usage);
    console.log('Использованная модель:', result.model);
    console.log('Количество вызовов инструментов:', result.toolCallsCount);
    console.log('Причина завершения:', result.finishReason);
    console.log('Время выполнения (мс):', result.durationMs);
    if (result.cost !== null) {
      console.log('Примерная стоимость (USD):', result.cost);
    }

    // Пример получения баланса
    const balance = await client.getCreditBalance();
    console.log(`Баланс кредитов: использовано $${balance.usage.toFixed(4)} из $${balance.limit.toFixed(2)}`);

  } catch (error: any) {
    console.error(`Ошибка: ${error.message}`, error.details || error);
  } finally {
    await client.destroy(); // Важно освободить ресурсы
  }
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  enableCostTracking: true, // Опционально
});

async function main() {
  try {
    const result = await client.chat({ prompt: 'Hello, world!' });
    console.log('Ответ модели:', result.content);
    console.log('Использование:', result.usage);
    console.log('Стоимость:', result.cost);
  } catch (error) {
     console.error(`Ошибка: ${error.message}`, error.details || error);
  } finally {
     await client.destroy();
  }
}

main();
```

## Более интересный пример (Такси-бот)

```javascript
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline');

// Пример конфигурации прокси (если нужно)
// const proxyConfig = {
//   host: "your.proxy.server",
//   port: 8080,
//   user: "proxy_user", // опционально
//   pass: "proxy_pass", // опционально
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001", // Используем актуальную модель
  historyStorage: "memory",
  // proxy: proxyConfig, // Раскомментируйте, если используете прокси
  enableCostTracking: true, // Включаем расчет стоимости
  // debug: true // Раскомментируйте для подробных логов
});

let orderAccepted = false; // Глобальная переменная для простоты примера

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
          from: { type: "string", description: "Адрес отправления" },
          to: { type: "string", description: "Адрес назначения" }
        },
        required: ["from", "to"]
      },
    },
    // Функция, которая будет выполнена
    execute: async (args) => {
      console.log(`[Инструмент] Расчет стоимости от ${args.from} до ${args.to}`);
      const cost = Math.floor(Math.random() * 900) + 100; // Симуляция расчета
      return {
        from: args.from,
        to: args.to,
        estimatedCost: cost,
        currency: "RUB"
      };
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Принимает заказ такси и назначает водителя.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Адрес отправления" },
          to: { type: "string", description: "Адрес назначения" }
        },
        required: ["from", "to"]
      },
    },
    // Функция, которая будет выполнена
    execute: async (args) => {
      console.log(`[Инструмент] Принятие заказа от ${args.from} до ${args.to}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Обновляем глобальное состояние
      // Возвращаем строку, подтверждающую действие
      return `Заказ принят. Водитель ${driverNumber} уже в пути к вам по адресу ${args.from}. Пункт назначения: ${args.to}`;
    }
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

const systemPrompt = `Ты — полезный оператор службы такси. Твоя цель — помочь клиенту заказать такси.
Ты можешь задавать уточняющие вопросы, если клиент не предоставил адреса.
Сначала оцени стоимость поездки с помощью 'estimateRideCost'.
После того как пользователь подтвердит стоимость, используй 'acceptOrder', чтобы забронировать поездку.`;

async function chatWithTaxiBot() {
  const userId = "taxi_user_1";
  console.log("Бот: Здравствуйте! Добро пожаловать в службу такси OpenRouterKit. Чем могу помочь?");

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("Вы: ");
      if (userMessage.toLowerCase() === 'quit') break;

      const result = await client.chat({ // Получаем ChatCompletionResult
        user: userId, // Включаем историю для этого пользователя
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Предоставляем инструменты
        temperature: 0.6,
        maxToolCalls: 5 // Ограничиваем количество раундов вызова инструментов
      });

      console.log(`\nБот: ${result.content}\n`); // Доступ к ответу через .content
      console.log(`[Отладка] Модель: ${result.model}, Вызовы инструментов: ${result.toolCallsCount}, Стоимость: ${result.cost !== null ? '$' + result.cost.toFixed(6) : 'N/A'}`);

      if (orderAccepted) {
        console.log("Бот: Ваш заказ такси успешно оформлен. Приятной поездки!");
      }
    }
  } catch (error) {
    console.error("Ошибка:", error.message, error.details || error);
  } finally {
    rl.close();
    await client.destroy(); // Важно: освобождаем ресурсы клиента
  }
}

// Запускаем бота
chatWithTaxiBot();
```

## 📚 Основные концепции

### `OpenRouterClient`

Это ваш основной интерфейс для работы с библиотекой.

**Конфигурация (`OpenRouterConfig`)**:

При создании `new OpenRouterClient(config)` передается объект `config`. Ключевые поля:

*   `apiKey` (string, **обязательно**): Ваш API ключ OpenRouter. **Рекомендуется использовать переменные окружения.**
*   `model` (string, опционально): Модель по умолчанию (по умолчанию: см. `config.ts`, например, `google/gemini-flash-1.5`).
*   `debug` (boolean, опционально): Включить подробное логирование (по умолчанию: `false`).
*   `historyAdapter` (IHistoryStorage, опционально): Кастомный адаптер истории (память, диск, Redis, API и др.).
*   `historyAutoSave` (boolean, опционально): Автосохранение истории при завершении процесса (если адаптер поддерживает).
*   `historyTtl` (number, опционально): Время жизни записей истории в мс (по умолчанию: 24 часа).
*   `historyCleanupInterval` (number, опционально): Интервал очистки истории в мс (по умолчанию: 1 час).
*   `maxHistoryEntries` (number, опционально): Максимальное количество *сообщений* (не пар) в истории (по умолчанию: 40).
*   `maxToolCalls` (number, опционально): Максимальное количество раундов вызова инструментов за один вызов `chat()` (по умолчанию: 10).
*   `security` (SecurityConfig, опционально): Конфигурация модуля безопасности (см. ниже). **Важно для обработки инструментов!**
*   `proxy` (string | object, опционально): Настройки HTTP/HTTPS прокси (URL или `{ host, port, user?, pass? }`).
*   `apiEndpoint` (string, опционально): URL API OpenRouter для чата (по умолчанию: `https://openrouter.ai/api/v1/chat/completions`).
*   `referer`, `title` (string, опционально): Заголовки `HTTP-Referer` и `X-Title` (для статистики OpenRouter).
*   `modelFallbacks` (string[], опционально): Список резервных моделей для попытки при ошибке основной.
*   `responseFormat` (ResponseFormat, опционально): Формат ответа по умолчанию (например, `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, опционально): Строгий режим парсинга/валидации JSON в ответах (по умолчанию: `false`). Если `true` - ошибка при невалидном JSON, если `false` - вернет `null` в поле `content`.
*   `axiosConfig` (AxiosRequestConfig, опционально): Дополнительные настройки для Axios (например, кастомные заголовки, таймауты).
*   `enableCostTracking` (boolean, опционально): Включить расчет стоимости вызовов (по умолчанию: `false`).
*   `priceRefreshIntervalMs` (number, опционально): Интервал обновления цен моделей в мс (по умолчанию: 6 часов).
*   `initialModelPrices` (Record<string, ModelPricingInfo>, опционально): Предоставить начальные цены моделей, чтобы избежать первого запроса к API.

**Основные методы**:

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Отправляет запрос модели. Обрабатывает историю и вызовы инструментов автоматически.
    *   `options.prompt` (string): Запрос пользователя (или `customMessages`).
    *   `options.customMessages` (Message[] | null): Предоставить полную историю сообщений вместо `prompt`.
    *   `options.user` (string): ID пользователя для управления историей.
    *   `options.tools` (Tool[]): Список доступных инструментов.
    *   `options.accessToken` (string): Токен доступа JWT (если используется `SecurityManager`).
    *   `options.maxToolCalls` (number): Переопределить лимит вызовов инструментов для этого запроса.
    *   ... и другие параметры API (`model`, `systemPrompt`, `temperature`, `maxTokens`, `responseFormat` и т.д.).
    *   Возвращает `Promise<ChatCompletionResult>` - объект с полями:
        *   `content`: Финальный ответ модели (строка, объект или `null`).
        *   `usage`: Суммарное использование токенов (`{ prompt_tokens, completion_tokens, total_tokens }` или `null`).
        *   `model`: ID модели, сгенерировавшей финальный ответ.
        *   `toolCallsCount`: Общее количество выполненных вызовов инструментов.
        *   `finishReason`: Причина завершения генерации финального ответа.
        *   `durationMs`: Общее время выполнения `chat()` в миллисекундах.
        *   `id`: ID последнего запроса к API.
        *   `cost`: Рассчитанная стоимость (USD) или `null`, если отслеживание выключено или цены неизвестны.
*   `setModel(model: string)`: Устанавливает модель по умолчанию.
*   `setApiKey(apiKey: string)`: Обновляет API ключ.
*   `createAccessToken(userInfo, expiresIn?)`: Создает JWT (требует `SecurityManager` с JWT).
*   `getCreditBalance(): Promise<CreditBalance>`: Запрашивает текущий баланс кредитов OpenRouter.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Возвращает кэшированные цены моделей.
*   `refreshModelPrices(): Promise<void>`: Принудительно обновляет кэш цен моделей.
*   `on(event, handler)` / `off(event, handler)`: Подписка/отписка от событий (`'error'`, события безопасности).
*   `getHistoryManager()`: Доступ к менеджеру истории.
*   `getSecurityManager()`: Доступ к менеджеру безопасности.
*   `getCostTracker()`: Доступ к трекеру стоимости (если включен).
*   `destroy(): Promise<void>`: **ВАЖНО!** Освобождает ресурсы (таймеры, кэши, обработчики). **Вызывайте при завершении работы с клиентом**, особенно в серверных приложениях, чтобы избежать утечек памяти и ресурсов.

### 🧩 Плагины и Middleware

**Плагины (`client.use(plugin)`):**

* Позволяют расширять или модифицировать поведение клиента без изменения ядра.
* Плагин — это объект с методом `init(client)`, который получает экземпляр `OpenRouterClient`.
* Внутри `init()` плагин может:
  * Добавлять middleware (`client.useMiddleware`)
  * Подписываться на события (`client.on`)
  * Заменять или расширять менеджеры (истории, безопасности, стоимости)
  * Добавлять свои методы, свойства, API
* Можно подключать несколько плагинов, порядок вызова сохраняется.

**Пример простого плагина:**

```typescript
const myPlugin = {
  async init(client) {
    console.log('Плагин инициализирован');
    client.useMiddleware(async (ctx, next) => {
      console.log('Мой middleware: запрос', ctx.request.options);
      await next();
      console.log('Мой middleware: ответ', ctx.response);
    });
  }
};

await client.use(myPlugin);
```

**Middleware (`client.useMiddleware(fn)`):**

* Позволяют централизованно обрабатывать, изменять или блокировать запросы и ответы.
* Используют знакомую модель Express/Koa: `(ctx, next) => { ... }`
* Могут:
  * Модифицировать `ctx.request.options` перед отправкой
  * Обрабатывать или изменять `ctx.response` после получения
  * Реализовать аудит, логирование, ограничение стоимости, контроль доступа, трассировку, кэширование и др.
* Вызываются в порядке регистрации (`client.useMiddleware(fn)`).
* Встроенная цепочка middleware уже оборачивает вызов `chat()`.

**Пример middleware для аудита:**

```typescript
client.useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[AUDIT] Запрос к модели ${ctx.request.options.model} занял ${duration} мс`);
  if (ctx.response?.error) {
    console.warn(`[AUDIT] Ошибка: ${ctx.response.error.message}`);
  } else {
    console.log(`[AUDIT] Ответ:`, ctx.response?.result?.content);
  }
});
```

*Middleware и плагины — основа для расширяемости, интеграции и кастомизации OpenRouter Kit.*

### 📜 Управление историей (адаптеры)

Библиотека автоматически подгружает и сохраняет историю, если в `client.chat()` передан `user` (и опционально `group`).

*   **Автоматизм:** Не нужно вручную формировать массив `messages`, если не требуется полный контроль (`customMessages`).
*   **Гибкая архитектура:** История хранится через адаптер `IHistoryStorage`.
*   **В комплекте:** Адаптеры для памяти и диска (JSON-файлы).
*   **Можно подключать свои:** Redis, MongoDB, REST API и др.
*   **Настройка:** TTL, лимиты, автосохранение — через конфиг клиента.

**Пример использования истории (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';

const client = new OpenRouter({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
const userId = 'user-xyz';

async function chatWithHistory(prompt: string) {
  console.log(`> User (${userId}): ${prompt}`);
  // Просто передаем user ID, остальное библиотека сделает сама
  const result = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${result.content}`); // Доступ к ответу через .content
  return result.content;
}

async function runConversation() {
  await chatWithHistory('Мой любимый цвет - синий.');
  await chatWithHistory('Какой мой любимый цвет?'); // Модель должна помнить
  await client.destroy();
}

runConversation();
```

### 🛠️ Обработка инструментов (Function Calling)

Позволяет моделям вызывать ваши функции.

**1. Определение инструмента (`Tool`)**:
Определите инструмент с помощью интерфейса `Tool`. **Ключевые поля:** `type: 'function'`, `function.name`, `function.parameters` (JSON Schema) и `execute` (ваша функция).

```typescript
import { Tool, ToolContext } from 'openrouter-kit';

// Пример простой функции
async function getUserData(userId: string): Promise<{ id: string; name: string; email: string } | null> {
  console.log(`[Инструмент] Получение данных для пользователя ${userId}`);
  // Симуляция получения данных
  if (userId === '123') {
    return { id: userId, name: 'Alice', email: 'alice@example.com' };
  }
  return null;
}

// Определение инструмента
const getUserDataTool: Tool = {
  type: 'function',
  function: {
    name: 'getUserData',
    description: 'Получает данные пользователя по его ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID пользователя для поиска.' },
      },
      required: ['userId'],
    },
  },
  // Ваша функция, которая будет вызвана
  execute: async (args: { userId: string }, context?: ToolContext) => {
    console.log(`Выполнение getUserData инициировано пользователем: ${context?.userInfo?.userId || 'unknown'}`);
    const userData = await getUserData(args.userId);
    if (!userData) {
      // Рекомендуется возвращать объект, описывающий результат
      return { error: 'Пользователь не найден' };
    }
    return userData; // Вернет { id: '123', name: 'Alice', email: 'alice@example.com' }
  },
  security: {
      // requiredRole: 'admin', // Пример ограничения доступа
  }
};
```

**2. Использование инструментов в `chat()`**:
Передайте массив инструментов в `client.chat({ tools: [...] })`. Библиотека берет на себя весь цикл: отправка определений -> получение запроса на вызов -> парсинг аргументов -> валидация схемы -> проверка безопасности -> вызов `execute` -> отправка результата -> получение финального ответа. Вы можете ограничить количество раундов вызова инструментов с помощью `maxToolCalls`.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';
// import { getUserDataTool } from './tools'; // Предположим, инструмент определен в другом файле

async function findUser() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' /*, security: securityConfig */ });
  try {
    const result = await client.chat({
      prompt: "Получи данные для пользователя с ID 123.",
      tools: [getUserDataTool], // Передаем инструмент
      maxToolCalls: 3 // Ограничиваем 3 раундами вызовов
    });
    console.log('Финальный ответ:', result.content); // например, "Данные для пользователя 123: Имя: Alice, Email: alice@example.com."
    console.log('Вызовов инструментов:', result.toolCallsCount);
  } catch (error: any) {
    console.error('Ошибка:', error.message);
  } finally {
    await client.destroy();
  }
}

findUser();
```

### 🔒 Модуль безопасности (`SecurityManager`)

Активируется передачей объекта `security: SecurityConfig` в конструктор `OpenRouterClient`. **Настоятельно рекомендуется использовать при работе с инструментами**, особенно если они выполняют какие-либо действия или имеют доступ к чувствительным данным.

**Ключевые аспекты конфигурации (`SecurityConfig`):**

*   `defaultPolicy`: `'deny-all'` (рекомендуется) или `'allow-all'`. Определяет доступ к инструментам, если нет явных правил.
*   `requireAuthentication`: `true` - требовать валидный `accessToken` для ЛЮБОГО запроса с инструментами.
*   `allowUnauthenticatedAccess`: `true` - разрешить вызовы инструментов без `accessToken` (если `requireAuthentication: false` и инструмент разрешен для анонимов).
*   `userAuthentication`: Настройка аутентификации (например, `{ type: 'jwt', jwtSecret: 'YOUR_STRONG_SECRET' }`). **Никогда не используйте секреты по умолчанию в production!**
*   `toolAccess`: Правила доступа для каждого инструмента (`allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`).
*   `roles`: Определение ролей и их разрешений/лимитов.
*   `dangerousArguments`: Настройка проверки аргументов (`blockedValues`, `globalPatterns`, `toolSpecificPatterns`, `extendablePatterns`, `auditOnlyMode`).

**Пример конфигурации и использования (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';
import type { SecurityConfig } from 'openrouter-kit'; // Используйте именованный импорт для типа

const jwtSecret = process.env.JWT_SECRET || 'very-secret-key-CHANGE-ME'; // Используйте env var!

const securityConfig: SecurityConfig = {
  debug: process.env.NODE_ENV === 'development', // Логи в разработке
  defaultPolicy: 'deny-all',
  requireAuthentication: true, // Требуется токен для вызова инструментов

  userAuthentication: {
    type: 'jwt',
    jwtSecret: jwtSecret,
  },

  toolAccess: {
    // Разрешить getCurrentWeather только для роли 'user', лимит 10/мин
    'getCurrentWeather': {
      allow: true,
      roles: ['user'],
      rateLimit: { limit: 10, period: 'minute' }
    },
    // Разрешить adminAction только для роли 'admin'
    'adminAction': {
      allow: true,
      roles: ['admin'],
    }
  },

  dangerousArguments: {
    auditOnlyMode: false, // Блокировать опасные аргументы
    extendablePatterns: [/custom_danger_pattern/i], // Добавить свои паттерны
  }
};

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  security: securityConfig
});

// --- Использование ---

async function secureToolCall() {
  try {
    // 1. Создание токена (например, после логина пользователя)
    const userInfo = { userId: 'alice-456', role: 'user' };
    const accessToken = client.createAccessToken(userInfo, '1h'); // Создаем JWT на 1 час

    // 2. Вызов чата с токеном
    const result = await client.chat({ // Получаем ChatCompletionResult
      prompt: 'Какая погода в Париже?',
      tools: [/* weatherTool - определен где-то еще */],
      accessToken: accessToken // Передаем токен
    });
    console.log('Ответ:', result.content); // Доступ через .content

  } catch (e: any) {
    // Обработка специфичных ошибок безопасности
    console.error(`Ошибка безопасности/чата: ${e.message} (Код: ${e.code})`, e.details);
  } finally {
    await client.destroy();
  }
}

// Подписка на события безопасности
client.on('access:denied', (event) => {
  console.warn(`[Событие] Доступ запрещен: Пользователь ${event.userId} к ${event.toolName}. Причина: ${event.reason}`);
});

secureToolCall();
```

### 📈 Отслеживание стоимости (Cost Tracking)

Библиотека может автоматически рассчитывать примерную стоимость каждого вызова `client.chat()` на основе данных об использованных токенах и ценах моделей OpenRouter.

**Включение:**

Установите `enableCostTracking: true` в конфигурации клиента:

```typescript
const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  enableCostTracking: true, // Включить отслеживание
  // priceRefreshIntervalMs: 4 * 60 * 60 * 1000 // Опционально: обновлять цены каждые 4 часа (по умолчанию 6)
});
```

**Как это работает:**

1.  При инициализации (или периодически) клиент запрашивает актуальные цены моделей с эндпоинта `/models` OpenRouter API.
2.  Цены кэшируются в памяти.
3.  После каждого успешного вызова `chat`, библиотека использует данные `usage` (количество токенов) и закэшированные цены для расчета стоимости.

**Результат:**

Если отслеживание включено, объект `ChatCompletionResult`, возвращаемый методом `chat`, будет содержать поле `cost` (тип `number | null`):

```typescript
const result = await client.chat({ prompt: 'Привет!' });

console.log('Контент:', result.content);
console.log('Использование:', result.usage);
console.log('Модель:', result.model);
console.log('Примерная стоимость (USD):', result.cost); // <-- Новое поле
```

**Получение баланса кредитов:**

Вы можете проверить текущий баланс кредитов, связанный с вашим API ключом:

```typescript
try {
  const balance = await client.getCreditBalance();
  console.log(`Лимит кредитов: $${balance.limit.toFixed(2)}`);
  console.log(`Текущее использование: $${balance.usage.toFixed(2)}`);
  console.log(`Осталось: $${(balance.limit - balance.usage).toFixed(2)}`);
} catch (error) {
  console.error("Не удалось получить баланс кредитов:", error);
}
```

**Управление ценами моделей:**

*   `client.getModelPrices(): Record<string, ModelPricingInfo>`: Получить текущий кэш цен моделей.
*   `client.refreshModelPrices(): Promise<void>`: Принудительно обновить кэш цен моделей.

### ⚙️ Формат ответа (`responseFormat`)

Заставьте модель генерировать ответ в виде JSON.

*   `{ type: 'json_object' }`: Гарантирует валидный JSON объект.
*   `{ type: 'json_schema', json_schema: { name: '...', schema: { ... } } }`: Гарантирует JSON, соответствующий вашей схеме.

**Примечание:** При использовании `responseFormat` и `strictJsonParsing: false` (по умолчанию), если модель вернет невалидный JSON или JSON, не соответствующий схеме, поле `content` в результате `client.chat()` будет `null`. Если `strictJsonParsing: true`, будет выброшена ошибка `ValidationError`.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

async function getStructuredData() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' });
  try {
    const userSchema = {
      type: "object",
      properties: { name: { type: "string"}, age: {type: "number"} },
      required: ["name", "age"]
    };
    const result = await client.chat({ // Получаем ChatCompletionResult
      prompt: 'Сгенерируй данные пользователя для Боба (возраст 42, bob@domain.com) согласно схеме.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      },
      // strictJsonParsing: true // Опционально: бросить ошибку при невалидном JSON/схеме
    });

    if (result.content) { // Проверяем поле content
      console.log('Структурированные данные пользователя:', result.content);
    } else {
      console.log('Модель не вернула валидный JSON, соответствующий схеме.');
    }
  } catch (error: any) {
    console.error('Ошибка:', error.message);
  } finally {
    await client.destroy();
  }
}

getStructuredData();
```

### ⚠️ Обработка ошибок

Ловите ошибки с помощью `try...catch` и проверяйте тип ошибки через `instanceof` или поле `error.code` (см. `ErrorCode` enum).

```typescript
import { OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

try {
  // ... вызов client.chat() ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 0) / 1000);
    console.warn(`Превышен лимит запросов! Попробуйте снова через ${retryAfter} секунд.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Ошибка валидации: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.TOOL_ERROR && error.message.includes('Maximum tool call depth')) {
     console.error(`Достигнут лимит вызовов инструментов: ${error.message}`);
  } else if (error instanceof OpenRouterError) { // Ловим остальные ошибки библиотеки
    console.error(`Ошибка OpenRouter Kit (${error.code}): ${error.message}`);
  } else {
    console.error(`Неизвестная ошибка: ${error.message}`);
  }
}
```

Вы также можете слушать глобальные ошибки клиента:
`client.on('error', (error) => { /* ... */ });`

### 🌐 Прокси

Настройка прокси выполняется в конфигурации клиента:

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

// Формат URL строки
const client1 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:pass@your-proxy.com:8080'
});

// Формат объекта
const client2 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: { host: 'proxy.example.com', port: 8888, user: 'usr', pass: 'pwd' }
});
```

## 📄 Лицензия

[MIT](LICENSE)