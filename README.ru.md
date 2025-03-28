**🇷🇺 Русский** | [🇬🇧 English](./README.md) 
---

# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Удобный TypeScript/JavaScript клиент для взаимодействия с [OpenRouter API](https://openrouter.ai/), предоставляющий:

*   Простой интерфейс для запросов к различным LLM через `/chat/completions`.
*   Автоматическое управление историей диалогов (в памяти или на диске).
*   Обработку вызовов инструментов (function calling), запрашиваемых моделями.
*   Мощный модуль безопасности для аутентификации, контроля доступа, ограничения частоты запросов (rate limiting) и проверки аргументов инструментов.
*   Гибкую конфигурацию (API ключ, модель, прокси, заголовки и т.д.).
*   Типизированные ошибки и систему событий.

## 🚀 Ключевые возможности

*   **Универсальный чат:** Отправка запросов к любой модели, поддерживаемой OpenRouter.
*   **Управление историей:** Автоматическое сохранение и подстановка истории диалогов для каждого пользователя/группы. Поддерживает хранение в памяти (`memory`) и на диске (`disk`) с TTL и автоочисткой.
*   **Обработка инструментов (Function Calling):**
    *   Определение инструментов с JSON Schema для аргументов.
    *   Автоматический парсинг и валидация аргументов, переданных моделью.
    *   Выполнение ваших функций (`execute`) с передачей контекста (включая информацию о пользователе).
    *   Отправка результатов выполнения инструментов обратно модели для получения финального ответа.
*   **Модуль безопасности:**
    *   **Аутентификация:** Поддержка JWT (создание, валидация, кэширование).
    *   **Контроль доступа:** Настройка доступа к инструментам на основе ролей, разрешений (scopes) или явных правил. Политики `allow-all`/`deny-all`.
    *   **Rate Limiting:** Ограничение частоты вызовов инструментов для пользователей/ролей.
    *   **Проверка аргументов:** Санация и валидация аргументов инструментов для предотвращения опасных операций.
    *   **События безопасности:** Подписка на события (доступ запрещен, лимит превышен, опасные аргументы и т.д.).
*   **Гибкая конфигурация:** Настройка модели по умолчанию, эндпоинта API, таймаутов, прокси, HTTP-заголовков (`Referer`, `X-Title`), резервных моделей (`modelFallbacks`), формата ответа (`responseFormat`) и др.
*   **Типизация:** Полностью типизирован на TypeScript.
*   **Обработка ошибок:** Иерархия кастомных ошибок (`APIError`, `ValidationError`, `SecurityError` и т.д.) для удобной обработки.
*   **Логирование:** Встроенный логгер с режимом отладки.
*   **События клиента:** Подписка на события клиента (например, `'error'`).

## 📦 Установка

```bash
npm install openrouter-kit
# или
yarn add openrouter-kit
```

## ✨ Базовое использование

js
```js
const { OpenRouterClient } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: 'sk-or-v1-',
  model: 'google/gemini-2.0-flash-001',
  // debug: true,
});

async function main() {
    const response = await client.chat({ prompt: 'Hello, world!' });
    console.log('Model response:', response);
}

main();
```

## 📚 Основные концепции

### `OpenRouterClient`

Основной класс для взаимодействия с API.

**Конфигурация (`OpenRouterConfig`)**:

При создании экземпляра `OpenRouterClient` передается объект конфигурации со следующими ключевыми полями:

*   `apiKey` (string, **обязательно**): Ваш API ключ OpenRouter.
*   `model` (string, опционально): Модель по умолчанию для запросов (по умолчанию: `google/gemini-2.0-flash-001`).
*   `debug` (boolean, опционально): Включить подробное логирование (по умолчанию: `false`).
*   `historyStorage` ('memory' | 'disk', опционально): Тип хранилища истории (по умолчанию: `memory`).
*   `historyAutoSave` (boolean, опционально): Автоматически сохранять историю при выходе для `disk` (по умолчанию: `false`).
*   `historyTtl` (number, опционально): Время жизни записей истории в мс (по умолчанию: 24 часа).
*   `historyCleanupInterval` (number, опционально): Интервал очистки устаревших записей истории в мс (по умолчанию: 1 час).
*   `security` (SecurityConfig, опционально): Конфигурация модуля безопасности (см. ниже).
*   `proxy` (string | object, опционально): Настройки HTTP/HTTPS прокси.
*   `apiEndpoint` (string, опционально): URL API OpenRouter (по умолчанию: официальный эндпоинт).
*   `referer`, `title` (string, опционально): Заголовки `HTTP-Referer` и `X-Title`.
*   `modelFallbacks` (string[], опционально): Список резервных моделей.
*   `responseFormat` (ResponseFormat, опционально): Формат ответа по умолчанию (например, `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, опционально): Строгий режим парсинга/валидации JSON в ответах (по умолчанию: `false`).
*   `axiosConfig` (AxiosRequestConfig, опционально): Дополнительные настройки для Axios.

**Основные методы**:

*   `chat(options: OpenRouterRequestOptions): Promise<any>`: Отправляет запрос к модели.
    *   `options.prompt` (string): Запрос пользователя (если не `customMessages`).
    *   `options.user` (string): ID пользователя для управления историей.
    *   `options.group` (string | null): ID группы/чата для истории (опционально).
    *   `options.systemPrompt` (string | null): Системное сообщение.
    *   `options.tools` (Tool[] | null): Список доступных инструментов.
    *   `options.responseFormat` (ResponseFormat | null): Формат ответа для этого запроса.
    *   `options.customMessages` (Message[] | null): Полный список сообщений (вместо prompt/history).
    *   `options.accessToken` (string | null): Токен доступа (если используется `SecurityManager`).
    *   ... другие параметры API (temperature, maxTokens, topP и т.д.).
    *   Возвращает: `string` (текстовый ответ), `object` (если запрошен JSON и парсинг/валидация успешны), `null` (если запрошен JSON, `strictJsonParsing=false` и парсинг/валидация не удались).
*   `setModel(model: string): void`: Устанавливает модель по умолчанию.
*   `setApiKey(apiKey: string): void`: Обновляет API ключ.
*   `createAccessToken(userInfo, expiresIn?): string`: Создает JWT токен (требует настроенного `SecurityManager`).
*   `on(event, handler)`: Подписка на события (`'error'`, события безопасности).
*   `off(event, handler)`: Отписка от событий.
*   `getHistoryManager(): HistoryManager`: Получить экземпляр менеджера истории.
*   `getSecurityManager(): SecurityManager | null`: Получить экземпляр менеджера безопасности.
*   `destroy(): Promise<void>`: **Освобождает ресурсы!**
    *   **Что делает:** Останавливает внутренние таймеры (`HistoryManager`, `RateLimitManager`), очищает кэши в памяти (токены, счетчики лимитов, история в `memory`), пытается сохранить историю на диск (если `historyStorage='disk'` и `autoSaveOnExit=true`), удаляет обработчики событий процесса Node.js и внутренние подписчики событий.
    *   **Когда вызывать:** **Крайне рекомендуется** вызывать этот метод, когда экземпляр клиента больше не нужен, особенно в **долгоживущих приложениях (серверах)** или при **динамическом создании/удалении клиентов**.
    *   **Зачем вызывать:** Предотвращает утечки памяти (из-за незакрытых таймеров и неудаленных обработчиков событий) и утечки ресурсов, гарантирует корректное завершение работы и сохранение данных истории.
    *   **Когда НЕ так критично (но все равно хорошая практика):** В очень простых, короткоживущих скриптах, которые выполняются и сразу завершаются (ОС очистит ресурсы процесса).

### 📜 Управление историей (`HistoryManager`)

Библиотека автоматически управляет историей диалогов, если при вызове `client.chat()` указан `user` (и опционально `group`).

*   **Хранилище:** `memory` (по умолчанию) или `disk` (сохраняет JSON файлы в папку, по умолчанию `./.openrouter-chats`).
*   **Ключ истории:** Генерируется на основе `user` и `group`.
*   **Ограничение:** Хранит последние `maxHistoryEntries` (по умолчанию: 20) пар сообщений (user/assistant).
*   **Очистка:** Автоматически удаляет устаревшие истории (по `ttl`, по умолчанию 24 часа) с интервалом `cleanupInterval` (по умолчанию 1 час).
*   **Автосохранение:** Опция `historyAutoSave: true` (для `disk`) сохраняет историю при завершении процесса (SIGINT/SIGTERM).

**Пример использования истории:**

```typescript
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
const userId = 'user-abc';

async function chatWithHistory(prompt: string) {
  console.log(`> User (${userId}): ${prompt}`);
  // Передаем 'user', чтобы включить управление историей
  const response = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${response}`);
  return response;
}

async function runConversation() {
  await chatWithHistory('Привет! Меня зовут Алекс.');
  await chatWithHistory('Какая сегодня погода в Москве?');
  await chatWithHistory('Как меня зовут?'); // Модель должна помнить имя из истории
  
  // В приложениях, где клиент используется длительное время, важен вызов destroy
  await client.destroy(); 
}

runConversation();
```

Доступ к менеджеру истории: `client.getHistoryManager()`.

### 🛠️ Обработка инструментов (Function Calling)

Модели могут запрашивать вызов ваших функций (инструментов) для получения внешней информации или выполнения действий.

**1. Определение инструмента (`Tool`)**:

Инструменты определяются как объекты, соответствующие интерфейсу `Tool`, и передаются в `client.chat()` через опцию `tools`.

```typescript
import { Tool, ToolContext } from 'openrouter-kit'; // Импортируем типы

// Пример функции для получения погоды
async function getCurrentWeather(location: string, unit: 'celsius' | 'fahrenheit' = 'celsius'): Promise<object> {
    console.log(`[Tool] Запрос погоды для ${location} (${unit})`);
    // ... здесь логика вызова API погоды ...
    // Возвращаем объект, который будет сериализован в JSON
    return { location, temperature: "25", unit, forecast: "sunny" };
}

// Определение инструмента для API
const weatherTool: Tool = {
  type: 'function',
  function: {
    name: 'getCurrentWeather', // Имя, которое будет использовать LLM
    description: 'Получить текущую погоду в указанном месте',
    parameters: { // JSON Schema для аргументов
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Город или место, например, Москва или San Francisco',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Единица измерения температуры',
        },
      },
      required: ['location'], // Обязательные аргументы
    },
  },
  // Функция, которая будет вызвана библиотекой
  execute: async (args: { location: string; unit?: 'celsius' | 'fahrenheit' }, context?: ToolContext) => {
      // args - распарсенные и провалидированные аргументы
      // context - содержит userInfo и securityManager (если доступны)
      console.log(`Executing getCurrentWeather for user: ${context?.userInfo?.userId || 'unknown'}`);
      return getCurrentWeather(args.location, args.unit);
  },
  // (Опционально) Настройки безопасности для этого инструмента
  security: {
      // requiredRole: 'premium_user',
      // rateLimit: { limit: 5, period: 'minute' }
  }
};
```

**2. Использование инструментов в `chat()`**:

Передайте массив определенных инструментов в опциях `chat`. Библиотека автоматически:

1.  Отправит определения инструментов модели.
2.  Если модель решит вызвать инструмент, библиотека получит `tool_calls`.
3.  Распарсит аргументы из JSON-строки, предоставленной моделью.
4.  Провалидирует аргументы по JSON Schema из определения инструмента.
5.  **(Если настроен `SecurityManager`)** Выполнит проверки безопасности: доступ, лимиты, опасные аргументы.
6.  Вызовет вашу функцию `execute` с распарсенными аргументами и контекстом.
7.  Отправит результат выполнения (или ошибку) обратно модели.
8.  Вернет вам финальный текстовый ответ модели после обработки результатов инструментов.

```typescript
async function askAboutWeather() {
  const client = new OpenRouterClient({ apiKey: 'YOUR_KEY' });
  try {
    const response = await client.chat({
      prompt: 'Какая погода в Лондоне?',
      tools: [weatherTool] // Передаем наш инструмент
    });
    console.log('Финальный ответ:', response);
  } catch (error: any) {
    console.error('Ошибка:', error.message);
  } finally {
    // Важно для долгоживущих приложений
    await client.destroy(); 
  }
}

askAboutWeather();
```

### 🔒 Модуль безопасности (`SecurityManager`)

Предоставляет комплексную защиту при работе с инструментами и аутентификацией пользователей. Активируется передачей конфигурации `security` при создании клиента.

**Компоненты:**

*   `AuthManager`: Управляет аутентификацией (сейчас реализован JWT).
*   `AccessControlManager`: Проверяет права доступа к инструментам на основе ролей и политик.
*   `RateLimitManager`: Отслеживает и применяет ограничения на частоту вызовов инструментов.
*   `ArgumentSanitizer`: Ищет потенциально опасные строки в аргументах инструментов.
*   `SecurityEventEmitter`: Шина событий безопасности.

**Конфигурация (`SecurityConfig`)**:

```typescript
import { OpenRouterClient } from 'openrouter-kit';
import type { SecurityConfig } from 'openrouter-kit/security'; // Импорт типа

const jwtSecret = process.env.JWT_SECRET || 'default-secret-replace-in-production'; // ВАЖНО: Замените на надежный секрет!

const securityConfig: SecurityConfig = {
  debug: true, // Включить логирование безопасности
  defaultPolicy: 'deny-all', // По умолчанию запрещать доступ к инструментам
  requireAuthentication: false, // Требовать ли аутентификацию для ЛЮБОГО запроса с инструментами
  allowUnauthenticatedAccess: false, // Разрешать ли доступ к инструментам БЕЗ токена (если requireAuthentication=false)

  // Настройки аутентификации
  userAuthentication: {
    type: 'jwt',
    jwtSecret: jwtSecret, // Секрет для подписи и проверки JWT
  },

  // Настройки доступа к инструментам (переопределяют defaultPolicy)
  toolAccess: {
    // Глобальные правила для всех инструментов
    '*': {
      // allow: false // Можно запретить все по умолчанию (если defaultPolicy='allow-all')
      // rateLimit: { limit: 100, period: 'hour' } // Глобальный лимит
    },
    // Правила для конкретного инструмента
    'getCurrentWeather': {
      allow: true, // Разрешаем вызов getCurrentWeather
      roles: ['user', 'admin'], // Только для пользователей с ролями 'user' или 'admin'
      rateLimit: { limit: 10, period: 'minute' } // Лимит для этого инструмента
    },
    'adminTool': {
      allow: true,
      roles: ['admin'], // Только для админов
    },
    'publicTool': {
      allow: true, // Разрешен всем (даже анонимам, если allowUnauthenticatedAccess=true)
    }
  },

  // Определение ролей (опционально, можно задавать лимиты и доступы прямо в toolAccess)
  roles: {
      roles: {
          'admin': {
              allowedTools: ['*'], // Разрешены все инструменты
              // rateLimits: { '*': { limit: 1000, period: 'hour' }} // Лимит для всех инструментов для админа
          },
          'user': {
              allowedTools: ['getCurrentWeather', 'publicTool'], // Явно разрешенные инструменты
              // rateLimits: { 'getCurrentWeather': { limit: 5, period: 'minute' }}
          }
      }
  },

  // Конфигурация проверки опасных аргументов
  dangerousArguments: {
    blockedValues: ['DROP TABLE', '--'], // Запрещенные подстроки
    // toolSpecificPatterns: { // Регулярные выражения для конкретных инструментов
    //   'executeShellCommand': [/rm -rf/, /mkfs/]
    // }
  }
};

const client = new OpenRouterClient({
  apiKey: 'YOUR_KEY',
  security: securityConfig // Передаем конфигурацию безопасности
});

// --- Использование ---

// 1. Создание токена доступа для пользователя (например, после логина)
try {
    const userInfo = { userId: 'user-123', role: 'user', scopes: ['read'] };
    const accessToken = client.createAccessToken(userInfo, '24h'); // Создаем JWT
    console.log('Access Token:', accessToken);

    // 2. Вызов chat с токеном
    async function callToolWithAuth(token: string) {
        const response = await client.chat({
            prompt: 'Какая погода в Берлине?',
            tools: [weatherTool], // Инструмент для погоды
            accessToken: token // Передаем токен
        });
        console.log('Ответ с инструментом:', response);
    }
    // await callToolWithAuth(accessToken);

} catch(e: any) {
    console.error("Ошибка работы с токеном или чатом:", e.message);
}

// Подписка на события безопасности
client.on('access:denied', (event) => {
    console.warn(`[EVENT] Access Denied: User '${event.userId || 'anon'}' to Tool '${event.toolName}'. Reason: ${event.reason}`);
});
client.on('ratelimit:exceeded', (event) => {
     console.warn(`[EVENT] Rate Limit Exceeded: User '${event.userId}' for Tool '${event.toolName}' (Limit: ${event.limit})`);
});

// Не забудьте client.destroy() при завершении работы приложения
// await client.destroy();
```

### ⚙️ Формат ответа (`responseFormat`)

Вы можете указать модели вернуть ответ в определенном формате JSON.

*   `{ type: 'json_object' }`: Модель вернет валидный JSON объект.
*   `{ type: 'json_schema', json_schema: { name: 'MySchema', schema: { ... } } }`: Модель вернет JSON, соответствующий вашей JSON Schema.

```typescript
async function getStructuredData() {
  const client = new OpenRouterClient({ apiKey: 'YOUR_KEY' });
  try {
    // Запрос JSON объекта
    const jsonResponse = await client.chat({
      prompt: 'Представь информацию о пользователе John Doe (30 лет, email john.doe@example.com) в виде JSON.',
      responseFormat: { type: 'json_object' },
      // strictJsonParsing: true, // Выбросить ошибку, если парсинг/валидация не удались
    });
    console.log('JSON Object:', jsonResponse); // Должен быть объект JS

    // Запрос JSON по схеме
    const userSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        email: { type: "string", format: "email" }
      },
      required: ["name", "age"]
    };

    const schemaResponse = await client.chat({
        prompt: 'Создай JSON для пользователя Jane Smith, 25 лет, jane@test.com',
        responseFormat: {
            type: 'json_schema',
            json_schema: {
                name: 'User',
                schema: userSchema
            }
        }
    });
     console.log('JSON Schema Response:', schemaResponse); // Должен быть объект JS, соответствующий схеме

  } catch (error: any) {
    console.error('Ошибка:', error.message);
  } finally {
    // Опять же, важно для долгоживущих приложений
    await client.destroy();
  }
}

getStructuredData();
```

### ⚠️ Обработка ошибок

Библиотека использует кастомные классы ошибок, наследуемые от `OpenRouterError`. Это позволяет легко различать типы ошибок:

*   `APIError`: Ошибка от API OpenRouter (статус >= 400).
*   `ValidationError`: Ошибка валидации (конфигурации, аргументов, ответа, JSON).
*   `NetworkError`: Ошибка сети.
*   `AuthenticationError`: Неверный API ключ (обычно 401).
*   `AuthorizationError`: Невалидный `accessToken` (JWT) (обычно 401).
*   `AccessDeniedError`: Доступ запрещен (роли/политики) (обычно 403).
*   `ToolError`: Ошибка во время выполнения `execute` инструмента (обычно 500).
*   `RateLimitError`: Превышен лимит запросов (обычно 429).
*   `TimeoutError`: Превышен таймаут запроса (обычно 408).
*   `ConfigError`: Неверная конфигурация библиотеки.
*   `SecurityError`: Общая ошибка безопасности (опасные аргументы и т.д.).

Вы можете ловить конкретные типы ошибок или использовать поле `code` (например, `error.code === ErrorCode.RATE_LIMIT_ERROR`).

```typescript
import { RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

// ...
try {
  // ... вызов client.chat() ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    console.warn(`Достигнут лимит запросов. Повторите через ${Math.ceil((error.details?.timeLeft || 0) / 1000)} сек.`);
  } else if (error instanceof ValidationError) {
    console.error(`Ошибка валидации: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.AUTHENTICATION_ERROR) {
     console.error(`Ошибка аутентификации: проверьте API ключ.`);
  } else {
    console.error(`Необработанная ошибка [${error.code || 'UNKNOWN'}]: ${error.message}`);
  }
}
```

Также можно подписаться на событие `'error'` клиента:

```typescript
client.on('error', (error) => {
  console.error(`[Client Event Error] Code: ${error.code}, Message: ${error.message}`);
});
```

### 🌐 Прокси

Настройте прокси через опцию `proxy` в конфигурации клиента:

```typescript
// Формат строки URL
const client1 = new OpenRouterClient({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:password@your-proxy-server:8080'
});

// Формат объекта
const client2 = new OpenRouterClient({
  apiKey: 'YOUR_KEY',
  proxy: {
    host: 'your-proxy-server.com',
    port: 8080,
    // user: 'proxy_user', // опционально
    // pass: 'proxy_pass'  // опционально
  }
});
```

## 📄 Лицензия

[MIT](LICENSE)