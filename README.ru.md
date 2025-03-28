# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.md)
---

**OpenRouter Kit** — это мощная и удобная TypeScript/JavaScript библиотека для работы с [OpenRouter API](https://openrouter.ai/). Она упрощает отправку запросов к LLM, автоматически управляет историей диалогов, обрабатывает вызовы инструментов (function calling) и предоставляет надежный модуль безопасности.

## 🚀 Ключевые возможности

*   **🤖 Универсальный чат:** Простой API (`client.chat`) для взаимодействия с любой моделью, доступной через OpenRouter.
*   **📜 Управление историей:** Автоматическая загрузка, сохранение и обрезка истории диалогов для каждого пользователя или группы.
    *   Поддержка хранилищ: `memory` (в памяти) и `disk` (JSON-файлы).
    *   Автоматическая очистка по TTL и ограничение максимального размера.
    *   Надежное сохранение на диск при завершении Node.js процесса (опционально).
*   **🛠️ Обработка инструментов (Function Calling):** Бесшовная интеграция вызова ваших функций моделью.
    *   Определение инструментов с JSON Schema для валидации аргументов.
    *   Автоматический парсинг, валидация схемы и **проверка безопасности** аргументов.
    *   Выполнение ваших `execute` функций с передачей контекста (включая `userInfo`).
    *   Автоматическая отправка результатов обратно модели для получения финального ответа.
*   **🛡️ Модуль безопасности:** Комплексная защита для ваших приложений.
    *   **Аутентификация:** Встроенная поддержка JWT (генерация, валидация, кэширование). Легко расширяется для других методов.
    *   **Контроль доступа (ACL):** Гибкая настройка доступа к инструментам на основе ролей, API-ключей, разрешений (scopes) или явных правил (`allow`/`deny`).
    *   **Ограничение частоты (Rate Limiting):** Применение лимитов на вызовы инструментов для пользователей или ролей.
    *   **Санитизация аргументов:** Проверка аргументов инструментов на наличие потенциально опасных паттернов (SQLi, XSS, command injection и т.д.) с возможностью настройки и режима аудита.
    *   **Система событий:** Подписка на события безопасности (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args` и др.) для мониторинга и логирования.
*   **⚙️ Гибкая конфигурация:** Настройка API ключа, модели по умолчанию, эндпоинта, таймаутов, **прокси**, заголовков (`Referer`, `X-Title`), резервных моделей (`modelFallbacks`), формата ответа (`responseFormat`) и др.
*   **💡 Типизация:** Полностью написан на TypeScript, обеспечивая автодополнение и проверку типов.
*   **🚦 Обработка ошибок:** Понятная иерархия кастомных ошибок (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError` и т.д.) с кодами и деталями.
*   **📝 Логирование:** Встроенный гибкий логгер с поддержкой префиксов и режима отладки.
*   **✨ Простота использования:** Высокоуровневый API, скрывающий сложность взаимодействия с LLM и инструментами.
*   **🧹 Управление ресурсами:** Метод `destroy()` для корректного освобождения ресурсов (таймеры, кэши, обработчики) в долгоживущих приложениях.

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
});

async function main() {
  const response = await client.chat({
    prompt: 'Передай привет',
    model: 'google/gemini-2.0-flash-001', // Опционально переопределяем модель
  });
  console.log('Model response:', response);
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit"); 

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...', 
});

async function main() {
    const response = await client.chat({ prompt: 'Hello, world!' });
    console.log('Model response:', response);
}

main();
```

## Более интересный пример

```js
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline');

const proxyConfig = {
  host: "держимся через прокси!",
  port: "1111",
  user: "1111",
  pass: "1111",
};

const client = new OpenRouterClient({
  apiKey: "sk-or-",
  model: "google/gemini-2.0-flash-001",
  historyStorage: "memory",
  proxy: proxyConfig
});

let orderAccepted = false; // Глобальная для примера!!

const taxiTools = [
  {
    type: "function",
    function: {
      name: "estimateRideCost",
      description: "Оценивает стоимость поездки между двумя точками",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Адрес отправления"
          },
          to: {
            type: "string",
            description: "Адрес назначения"
          }
        },
        required: ["from", "to"]
      },
      execute: async (args) => {
        const cost = Math.floor(Math.random() * 900) + 100;
        return {
          from: args.from,
          to: args.to,
          estimatedCost: cost,
          currency: "RUB"
        };
      }
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Принимает заказ такси и назначает водителя",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Адрес отправления"
          },
          to: {
            type: "string",
            description: "Адрес назначения"
          }
        },
        required: ["from", "to"]
      },
      execute: async (args) => {
        const driverNumber = Math.floor(Math.random() * 100) + 1;
        orderAccepted = true;
        return `Заказ принят таксистом Таксист ${driverNumber}. От ${args.from} до ${args.to}`;
      }
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

const systemPrompt = `Ты оператор службы такси. Твоя задача - помочь клиенту заказать такси. 

Ты можешь задавать уточняющие вопросы, если клиент не указал адреса.`;

async function chatWithTaxiBot() {
  try {
    const userId = "user1";
    const welcomeMessage = "Здравствуйте! Вы позвонили в службу такси OpenRouterKit";
    console.log(welcomeMessage);
    
    while (!orderAccepted) {
      const userMessage = await askQuestion("Вы: ");
      
      const response = await client.chat({
        user: userId,
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools,
        temperature: 0.7,
        saveChat: true
      });
      
      console.log(`\nБот: ${response}\n`);
      
      if (orderAccepted) {
        console.log("Ваш заказ такси успешно оформлен. Всего доброго!");
      }
    }
  } catch (error) {
    console.error("Ошибка:", error);
  } finally {
    rl.close();
  }
}

(async () => {
    await chatWithTaxiBot();
})();
```

## 📚 Основные концепции

### `OpenRouterClient`

Это ваш основной интерфейс для работы с библиотекой.

**Конфигурация (`OpenRouterConfig`)**:

При создании `new OpenRouterClient(config)` передается объект `config`. Ключевые поля:

*   `apiKey` (string, **обязательно**): Ваш API ключ OpenRouter. **Рекомендуется использовать переменные окружения.**
*   `model` (string, опционально): Модель по умолчанию (по умолчанию: см. `config.ts`, например, `google/gemini-2.0-flash-001`).
*   `debug` (boolean, опционально): Включить подробное логирование (по умолчанию: `false`).
*   `historyStorage` ('memory' | 'disk', опционально): Тип хранилища истории (по умолчанию: `memory`).
*   `historyAutoSave` (boolean, опционально): Автосохранение истории при выходе для `disk` (по умолчанию: `false`).
*   `historyTtl` (number, опционально): Время жизни записей истории в мс (по умолчанию: 24 часа).
*   `historyCleanupInterval` (number, опционально): Интервал очистки истории в мс (по умолчанию: 1 час).
*   `security` (SecurityConfig, опционально): Конфигурация модуля безопасности (см. ниже). **Важно для обработки инструментов!**
*   `proxy` (string | object, опционально): Настройки HTTP/HTTPS прокси (URL или `{ host, port, user?, pass? }`).
*   `apiEndpoint` (string, опционально): URL API OpenRouter.
*   `referer`, `title` (string, опционально): Заголовки `HTTP-Referer` и `X-Title` (для статистики OpenRouter).
*   `modelFallbacks` (string[], опционально): Список резервных моделей для попытки при ошибке основной.
*   `responseFormat` (ResponseFormat, опционально): Формат ответа по умолчанию (например, `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, опционально): Строгий режим парсинга/валидации JSON в ответах (по умолчанию: `false`). Если `true` - ошибка при невалидном JSON, если `false` - вернет `null`.
*   `axiosConfig` (AxiosRequestConfig, опционально): Дополнительные настройки для Axios (например, кастомные заголовки, таймауты).

**Основные методы**:

*   `chat(options: OpenRouterRequestOptions): Promise<any>`: Отправляет запрос модели. Обрабатывает историю и вызовы инструментов автоматически.
    *   `options.prompt` (string): Запрос пользователя.
    *   `options.user` (string): ID пользователя для управления историей.
    *   `options.tools` (Tool[]): Список доступных инструментов.
    *   `options.accessToken` (string): Токен доступа JWT (если используется `SecurityManager`).
    *   ... и другие параметры API (`model`, `systemPrompt`, `temperature`, `maxTokens`, `responseFormat` и т.д.).
    *   Возвращает: Ответ модели (`string`), распарсенный объект (`object` если запрошен JSON), или `null` (при ошибке парсинга JSON с `strictJsonParsing: false`).
*   `setModel(model: string)`: Устанавливает модель по умолчанию.
*   `setApiKey(apiKey: string)`: Обновляет API ключ.
*   `createAccessToken(userInfo, expiresIn?)`: Создает JWT (требует `SecurityManager` с JWT).
*   `on(event, handler)` / `off(event, handler)`: Подписка/отписка от событий (`'error'`, события безопасности).
*   `getHistoryManager()`: Доступ к менеджеру истории.
*   `getSecurityManager()`: Доступ к менеджеру безопасности.
*   `destroy(): Promise<void>`: **ВАЖНО!** Освобождает ресурсы (таймеры, кэши, обработчики). **Вызывайте при завершении работы с клиентом**, особенно в серверных приложениях, чтобы избежать утечек памяти и ресурсов.

### 📜 Управление историей (`HistoryManager`)

Библиотека автоматически подгружает и сохраняет историю, если в `client.chat()` передан `user` (и опционально `group`).

*   **Автоматизм:** Не нужно вручную формировать массив `messages`, если не требуется полный контроль (`customMessages`).
*   **Хранилища:** `memory` (быстро, не персистентно) или `disk` (сохраняет JSON в `./.openrouter-chats` по умолчанию).
*   **Настройка:** Управляйте размером (`maxHistoryEntries`), временем жизни (`ttl`), интервалом очистки (`cleanupInterval`) и автосохранением (`historyAutoSave`) через конфигурацию клиента.

**Пример использования истории (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';

const client = new OpenRouter({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
const userId = 'user-xyz';

async function chatWithHistory(prompt: string) {
  console.log(`> User (${userId}): ${prompt}`);
  // Просто передаем user ID, остальное библиотека сделает сама
  const response = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${response}`);
  return response;
}

async function runConversation() {
  await chatWithHistory('My favorite color is blue.');
  await chatWithHistory('What is my favorite color?'); // Модель должна помнить
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
  console.log(`[Tool] Fetching data for user ${userId}`);
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
    console.log(`Executing getUserData initiated by user: ${context?.userInfo?.userId || 'unknown'}`);
    const userData = await getUserData(args.userId);
    if (!userData) {
      // Рекомендуется возвращать объект, описывающий результат
      return { error: 'User not found' };
    }
    return userData;
  },
  security: {
      // requiredRole: 'admin', // Пример ограничения доступа
  }
};
```

**2. Использование инструментов в `chat()`**:
Передайте массив инструментов в `client.chat({ tools: [...] })`. Библиотека берет на себя весь цикл: отправка определений -> получение запроса на вызов -> парсинг аргументов -> валидация схемы -> проверка безопасности -> вызов `execute` -> отправка результата -> получение финального ответа.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';
// import { getUserDataTool } from './tools'; // Предположим, инструмент определен в другом файле

async function findUser() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' /*, security: securityConfig */ });
  try {
    const response = await client.chat({
      prompt: "Get data for user with ID 123.",
      tools: [getUserDataTool] // Передаем инструмент
    });
    console.log('Final response:', response); // e.g., "The data for user 123 is: Name: Alice, Email: alice@example.com."
  } catch (error: any) {
    console.error('Error:', error.message);
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
    const response = await client.chat({
      prompt: 'What is the weather like in Paris?',
      tools: [/* weatherTool - определен где-то еще */],
      accessToken: accessToken // Передаем токен
    });
    console.log('Response:', response);

  } catch (e: any) {
    // Обработка специфичных ошибок безопасности
    console.error(`Security/Chat Error: ${e.message} (Code: ${e.code})`, e.details);
  } finally {
    await client.destroy();
  }
}

// Подписка на события безопасности
client.on('access:denied', (event) => {
  console.warn(`[Event] Access Denied: User ${event.userId} to ${event.toolName}. Reason: ${event.reason}`);
});

secureToolCall();
```

### ⚙️ Формат ответа (`responseFormat`)

Заставьте модель генерировать ответ в виде JSON.

*   `{ type: 'json_object' }`: Гарантирует валидный JSON.
*   `{ type: 'json_schema', json_schema: { name: '...', schema: { ... } } }`: Гарантирует JSON, соответствующий вашей схеме.

**Примечание:** При использовании `responseFormat` и `strictJsonParsing: false` (по умолчанию), если модель вернет невалидный JSON или JSON, не соответствующий схеме, `client.chat()` вернет `null`. Если `strictJsonParsing: true`, будет выброшена ошибка `ValidationError`.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

async function getStructuredData() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' });
  try {
    const userSchema = {
      type: "object",
      properties: { /* ... */ },
      required: [/* ... */]
    };
    const userData = await client.chat({
      prompt: 'Generate user data for Bob (age 42, bob@domain.com) according to the schema.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      },
      // strictJsonParsing: true // Опционально: бросить ошибку при невалидном JSON/схеме
    });

    if (userData) {
      console.log('Structured User Data:', userData);
    } else {
      console.log('Model did not return valid JSON conforming to the schema.');
    }
  } catch (error: any) {
    console.error('Error:', error.message);
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
    console.warn(`Rate limit hit! Try again in ${retryAfter} seconds.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Validation failed: ${error.message}`, error.details);
  } else if (error instanceof OpenRouterError) { // Ловим остальные ошибки библиотеки
    console.error(`OpenRouter Kit Error (${error.code}): ${error.message}`);
  } else {
    console.error(`Unknown error: ${error.message}`);
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
```