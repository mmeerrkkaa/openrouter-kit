# OpenRouter Kit

[![Версия npm](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![Лицензия: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.en.md)
---

**OpenRouter Kit** — это мощная, гибкая и удобная TypeScript/JavaScript библиотека для взаимодействия с [OpenRouter API](https://openrouter.ai/). Она упрощает работу с LLM, предоставляя унифицированный API для чатов, управление историей, обработку инструментов (function calling), маршрутизацию запросов, веб-поиск, токены рассуждений и многое другое.

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

И не забываем про добрый прокси

```typescript
// simple-chat.ts
import { OpenRouterClient } from 'openrouter-kit';

// Инициализируем клиент с вашим API ключом
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: "google/gemini-2.0-flash-001" // Модель по умолчанию для всех вызовов
});

async function main() {
  try {
    console.log('Отправка простого запроса...');
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
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
  } finally {
    console.log('\nЗавершение работы...');
    // Освобождаем ресурсы (таймеры и т.д.)
    await client.destroy();
  }
}

main();
```

```javascript
// .js.
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: "sk-or-v1-",
  historyAdapter: new MemoryHistoryStorage(),
  model: "google/gemini-2.0-flash-exp:free",
//  proxy: proxyConfig, // For people from countries where models are prohibited (for example, Russia), a proxy is required.
  debug: false
});

const systemPrompt = `You are a helpful assistant.`;

async function dasd(nick, message) {
  console.log(`[${nick}]: ${message}`);

    const result = await client.chat({
      systemPrompt: systemPrompt,
      prompt: message,
      user: nick,
      temperature: 0.7
    });
    
    console.log(`[bot]: ${result.content}`);
    return result.content;
}

async function main() {
    const result1 = await dasd("merka", "my name is merka");
    const result2 = await dasd("merkava", "what is my name?");
    const result3 = await dasd("merka", "what is my name?");
    

    console.log("result1:", result1);
    console.log("result2:", result2);
    console.log("result3:", result3);
    
}

main(); 
```

### 2. Пример диалога (с управлением историей)

Чтобы поддерживать контекст диалога, используйте `historyAdapter` и передавайте `user` ID. Библиотека автоматически загрузит и сохранит историю.

```typescript
// dialog-chat.ts
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // Используем MemoryHistoryStorage для хранения истории в памяти
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Включаем расчет стоимости
  model: "google/gemini-2.0-flash-001"
});

const userId = 'dialog-user-123'; // Уникальный ID для пользователя

async function runDialog() {
  try {
    // Первое сообщение
    console.log(`[${userId}] Вы: Привет! Как тебя зовут?`);
    const result1 = await client.chat({
      user: userId, // <-- Передаем ID пользователя для автоматического управления историей
      prompt: 'Привет! Как тебя зовут?',
    });
    console.log(`[${userId}] Бот: ${result1.content}`);
    console.log(`(Стоимость: $${result1.cost?.toFixed(6) || 'N/A'})`);

    // Второе сообщение (модель должна помнить контекст)
    console.log(`\n[${userId}] Вы: Какая погода сегодня?`);
    const result2 = await client.chat({
      user: userId, // <-- Тот же ID пользователя
      prompt: 'Какая погода сегодня?',
    });
    console.log(`[${userId}] Бот: ${result2.content}`);
    console.log(`(Стоимость: $${result2.cost?.toFixed(6) || 'N/A'})`);

    // Проверим сохраненную историю
    const historyManager = client.getHistoryManager();
    // Внутренний формат ключа зависит от реализации _getHistoryKey
    const historyKey = `user:${userId.replace(/[:/\\?#%]/g, '_')}`;
    const history = await historyManager.getHistory(historyKey);
    console.log(`\nСохранено сообщений в истории для ${historyKey}: ${history.length}`);

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

### 3. Пример использования инструментов (Tools / Function Calling)

Этот пример показывает, как модель может использовать предоставленные вами функции (инструменты) для получения внешней информации.

```javascript
// tools-example.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");

// --- Пример данных (замените на ваши реальные источники) ---
const users = [ { id: "user_1001", nick: "alice" }, /* ... */ ];
const messages = [ { id: "msg_101", userId: "user_1001", content: "Привет!" }, /* ... */ ];
// ---

// --- Определения инструментов ---
const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Получает ID пользователя по его никнейму",
      parameters: { /* ... схема аргументов ... */ },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserIdByNick] Args: ${JSON.stringify(args)}`);
      const user = users.find(u => u.nick.toLowerCase() === args.nick.toLowerCase());
      return user ? { userId: user.id, found: true } : { userId: null, found: false };
    }
  },
  {
    type: "function",
    function: {
      name: "getUserMessages",
      description: "Получает все сообщения пользователя по его ID",
      parameters: { /* ... схема аргументов ... */ },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserMessages] Args: ${JSON.stringify(args)}`);
      const userMessages = messages.filter(m => m.userId === args.userId);
      return { messages: userMessages, count: userMessages.length, found: userMessages.length > 0 };
    }
  }
];
// ---

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001", // Модель, поддерживающая инструменты
});

async function main() {
  try {
    const promptAlice = "Найди все сообщения пользователя alice.";
    console.log(`\nЗапрос: "${promptAlice}"`);
    const resultAlice = await client.chat({
      prompt: promptAlice,
      tools: userTools,
      temperature: 0.5, 
    });
    console.log(`Ответ:\n${resultAlice.content}`);
    console.log(`(Вызовов инструментов: ${resultAlice.toolCallsCount})`);

    const promptNonExistent = "Что писал пользователь nonexistent_user?";
    console.log(`\nЗапрос: "${promptNonExistent}"`);
    const resultNonExistent = await client.chat({
      prompt: promptNonExistent,
      tools: userTools,
      temperature: 0.1,
    });
    console.log(`Ответ:\n${resultNonExistent.content}`);
    console.log(`(Вызовов инструментов: ${resultNonExistent.toolCallsCount})`);

  } catch (error) {
    console.error("\n--- Ошибка ---");
    console.error(error);
  } finally {
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
        *   [Основные методы](#основные-методы)
        *   [Опции запроса `client.chat` (OpenRouterRequestOptions)](#-опции-запроса-clientchat-openrouterrequestoptions)
        *   [Результат `client.chat` (ChatCompletionResult)](#-результат-clientchat-chatcompletionresult)
    *   [Плагины и Middleware](#-плагины-и-middleware)
    *   [Управление историей (Адаптеры)](#-управление-историей-адаптеры)
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
*   **Безопасность:** Встроенный модуль безопасности помогает защитить ваши приложения и пользователей при использовании инструментов.
*   **Расширяемость:** Используйте плагины и middleware для добавления пользовательской логики без изменения ядра библиотеки.
*   **Надежность:** Полная типизация на TypeScript, предсказуемая обработка ошибок (включая структурированные ошибки инструментов) и управление ресурсами.
*   **Современные функции:** Поддержка веб-поиска, токенов рассуждений, структурированных выводов и других возможностей OpenRouter API.

### 🚀 Ключевые возможности

*   **🤖 Универсальный чат:** Простой и мощный API (`client.chat`) для взаимодействия с любой моделью, доступной через OpenRouter.
*   **📜 Управление историей (через адаптеры):** **Требует конфигурации `historyAdapter`**. Автоматическая загрузка и сохранение истории диалогов для каждого пользователя (`user`).
    *   Гибкая система истории на базе **адаптеров** (`IHistoryStorage`).
    *   В комплекте: `MemoryHistoryStorage`, `DiskHistoryStorage`.
    *   Легко подключать свои адаптеры или использовать готовый плагин (`createRedisHistoryPlugin`).
    *   Настройка TTL кэша (`historyTtl`) и интервалов очистки (`historyCleanupInterval`).
*   **🛠️ Обработка инструментов (Function Calling):** Бесшовная интеграция вызова ваших функций моделью.
    *   Определение инструментов (`Tool`) с JSON Schema для валидации аргументов.
    *   Автоматический парсинг, валидация и **проверка безопасности** аргументов.
    *   Выполнение ваших `execute` функций с передачей контекста (`ToolContext`).
    *   Автоматическая отправка результатов обратно модели.
    *   **Структурированная обработка ошибок инструментов** для лучшего понимания моделью.
    *   Настраиваемый лимит на рекурсивные вызовы (`maxToolCalls`).
*   **🛡️ Модуль безопасности:** Комплексная и настраиваемая защита.
    *   **Аутентификация:** JWT (встроенная), `api-key`, `custom`.
    *   **Контроль доступа (ACL):** По ролям, скоупам, API-ключам, явным правилам.
    *   **Ограничение частоты (Rate Limiting):** Настраиваемые лимиты для пользователей/ролей. (Стандартная реализация **не** для распределенных систем).
    *   **Санитизация аргументов:** Защита от опасных паттернов (SQLi, XSS и др.). Режим аудита.
    *   **Система событий** для мониторинга.
*   **📈 Отслеживание стоимости (Cost Tracking):** (Опционально) Автоматический расчет примерной стоимости каждого вызова `chat()`. Фоновое обновление цен. Метод `getCreditBalance()`.
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
  model: "google/gemini-2.0-flash-001",
  historyAdapter: new MemoryHistoryStorage(), // Обязательно для истории
  enableCostTracking: true,
  debug: false, // Установите true для подробных логов
  // security: { /* ... */ } // Можно добавить конфигурацию безопасности
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
      orderAccepted = true; // Устанавливаем флаг для завершения цикла
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
        user: userId, // Ключ для истории
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Передаем доступные инструменты
        temperature: 0.5,
        maxToolCalls: 5 // Ограничиваем количество циклов вызова инструментов
      });

      // Выводим финальный ответ ассистента
      console.log(`\nБот Кит: ${result.content}\n`);

      // Выводим отладочную информацию, если включено
      if (client.isDebugMode()) {
          console.log(`[Отладка] Модель: ${result.model}, Вызовы инстр.: ${result.toolCallsCount}, Стоимость: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Причина: ${result.finishReason}`);
          if (result.reasoning) console.log(`[Отладка] Рассуждения: ${result.reasoning}`);
          if (result.annotations && result.annotations.length > 0) console.log(`[Отладка] Аннотации:`, result.annotations);
      }

      // Проверяем флаг, установленный инструментом acceptOrder
      if (orderAccepted) {
        console.log("Бот Кит: Если у вас есть еще вопросы, я готов помочь!");
        // Можно добавить break здесь, если диалог должен завершиться после заказа
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
    await client.destroy(); // Освобождаем ресурсы
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
*   `apiEndpoint?` (string): URL эндпоинта для чат-комплишенов (по умолчанию: `https://openrouter.ai/api/v1/chat/completions`).
*   `model?` (string): Модель по умолчанию для запросов.
*   `debug?` (boolean): Включить подробное логирование (по умолчанию: `false`).
*   `proxy?` (string | object): Настройки HTTP/HTTPS прокси.
*   `referer?` (string): Значение заголовка `HTTP-Referer`.
*   `title?` (string): Значение заголовка `X-Title`.
*   `axiosConfig?` (object): Дополнительная конфигурация для Axios.
*   `historyAdapter?` (IHistoryStorage): **Обязательно для использования истории.** Экземпляр адаптера хранилища истории (например, `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Время жизни (TTL) записей в кэше истории `UnifiedHistoryManager` (в миллисекундах).
*   `historyCleanupInterval?` (number): Интервал очистки просроченных записей из кэша истории `UnifiedHistoryManager` (в миллисекундах).
*   `defaultProviderRouting?` (ProviderRoutingConfig): Правила маршрутизации провайдеров по умолчанию.
*   `modelFallbacks?` (string[]): Список резервных моделей по умолчанию.
*   `responseFormat?` (ResponseFormat | null): Формат ответа по умолчанию.
*   `maxToolCalls?` (number): Максимальное количество циклов вызова инструментов за один вызов `chat()` (по умолчанию: 10).
*   `strictJsonParsing?` (boolean): Выбрасывать ошибку при невалидном JSON в ответе (если запрошен JSON формат)? (по умолчанию: `false`, возвращает `null`).
*   `security?` (SecurityConfig): Конфигурация модуля безопасности (использует базовый тип `SecurityConfig` из `./types`).
*   `enableCostTracking?` (boolean): Включить отслеживание стоимости (по умолчанию: `false`).
*   `priceRefreshIntervalMs?` (number): Интервал обновления цен моделей (по умолчанию: 6 часов).
*   `initialModelPrices?` (object): Начальные цены моделей для избежания первого запроса цен.
*   *Устаревшие поля:* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`, `enableReasoning`, `webSearch`.

##### Основные методы

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Основной метод для отправки запроса в чат. Принимает объект `options` с параметрами запроса (см. ниже).
*   `getHistoryManager(): UnifiedHistoryManager`: Возвращает менеджер истории.
*   `getSecurityManager(): SecurityManager | null`: Возвращает менеджер безопасности.
*   `getCostTracker(): CostTracker | null`: Возвращает трекер стоимости.
*   `getCreditBalance(): Promise<CreditBalance>`: Запрашивает баланс кредитов.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Возвращает кэш цен моделей.
*   `refreshModelPrices(): Promise<void>`: Принудительно обновляет кэш цен.
*   `createAccessToken(userInfo, expiresIn?): string`: Генерирует JWT (если настроено).
*   `use(plugin): Promise<void>`: Регистрирует плагин.
*   `useMiddleware(fn): void`: Регистрирует middleware.
*   `on(event, handler)` / `off(event, handler)`: Подписка/отписка от событий.
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
*   `toolCallsCount` (number): Общее количество успешных вызовов инструментов в рамках этого запроса.
*   `finishReason` (string | null): Причина завершения генерации финального ответа (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
*   `durationMs` (number): Общее время выполнения запроса `chat()` в миллисекундах.
*   `id?` (string): ID последнего шага генерации от API OpenRouter.
*   `cost?` (number | null): Рассчитанная примерная стоимость запроса (если `enableCostTracking: true`).
*   `reasoning?` (string | null): Строка с шагами рассуждений модели (если были запрошены и возвращены).
*   `annotations?` (UrlCitationAnnotation[]): Массив аннотаций (например, цитат веб-поиска), связанных с финальным ответом.

#### 🧩 Плагины и Middleware

*   **Плагины:** Модули, расширяющие функциональность клиента. Регистрируются через `client.use(plugin)`. Могут инициализировать сервисы, заменять стандартные менеджеры (`setSecurityManager`, `setCostTracker`), добавлять middleware.
*   **Middleware:** Функции, выполняющиеся последовательно для каждого вызова `client.chat()`. Позволяют модифицировать запрос (`ctx.request`), ответ (`ctx.response`) или выполнять побочные действия (логирование, аудит). Регистрируются через `client.useMiddleware(fn)`.

#### 📜 Управление историей (Адаптеры)

Для автоматического управления историей диалогов **необходимо сконфигурировать `historyAdapter`** в `OpenRouterConfig`.

*   **Адаптер (`IHistoryStorage`):** Определяет интерфейс для хранилища (`load`, `save`, `delete`, `listKeys`, `destroy?`).
*   **`UnifiedHistoryManager`:** Внутренний компонент, использующий адаптер и управляющий кэшированием в памяти.
*   **Встроенные адаптеры:** `MemoryHistoryStorage`, `DiskHistoryStorage`.
*   **Подключение:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';
    const client = new OpenRouterClient({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
    ```
*   **Плагин для Redis:** Используйте `createRedisHistoryPlugin`.
*   **Настройки кэша:** `historyTtl`, `historyCleanupInterval`.

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
3.  **Результат:** Финальный ответ в `ChatCompletionResult.content`, количество вызовов в `ChatCompletionResult.toolCallsCount`.

#### 🔒 Модуль безопасности (`SecurityManager`)

Активируется передачей объекта `security: SecurityConfig` в конструктор `OpenRouterClient`. Обеспечивает аутентификацию, контроль доступа, rate limiting и санитизацию аргументов для вызовов инструментов. Требует внимательной настройки, особенно `userAuthentication.jwtSecret`. **Стандартный Rate Limiter не подходит для распределенных систем.**

#### 📈 Отслеживание стоимости (Cost Tracking)

Включается через `enableCostTracking: true`. Рассчитывает **примерную** стоимость вызовов `chat()` на основе данных `usage` и кэшируемых цен моделей. Предоставляет методы `getCreditBalance()`, `getModelPrices()`, `refreshModelPrices()`.

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

Запросите ответ в формате JSON.

*   **Конфигурация:** Опция `responseFormat` в `OpenRouterConfig` или `OpenRouterRequestOptions`.
*   **Типы:**
    *   `{ type: 'json_object' }`: Любой валидный JSON.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: JSON, соответствующий вашей схеме. Флаг `strict` передается в API, если указан.
*   **Обработка ошибок парсинга:** Зависит от `strictJsonParsing` (по умолчанию `false` - вернет `null`, `true` - выбросит `ValidationError`).

#### ⚠️ Обработка ошибок

Используйте `try...catch` и проверяйте ошибки через `instanceof` или `error.code` (`ErrorCode`). Подписывайтесь на событие `'error'` клиента для глобального логирования.

#### 📝 Логирование

Включается через `debug: true`. Использует `console` с префиксами компонентов.

#### 🌐 Прокси

Настраивается через опцию `proxy` (URL строка или объект `{ host, port, user?, pass? }`) в `OpenRouterConfig`.

### 📄 Лицензия

[MIT](./LICENSE)
