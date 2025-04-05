# OpenRouter Kit

[![Версия npm](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![Лицензия: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

**🇷🇺 Русский** | [🇬🇧 English](./README.en.md) <!-- Предполагаем, что английская версия будет в README.en.md -->
---

**OpenRouter Kit** — это мощная, гибкая и удобная TypeScript/JavaScript библиотека для взаимодействия с [OpenRouter API](https://openrouter.ai/). Она значительно упрощает работу с LLM, предоставляя высокоуровневый API для чатов, автоматическое управление историей диалогов, бесшовную обработку вызовов инструментов (function calling), надежный и настраиваемый модуль безопасности, а также опциональное отслеживание стоимости запросов. Идеально подходит для создания чат-ботов, ИИ-агентов и интеграции LLM в ваши приложения.

## Зачем использовать OpenRouter Kit?

*   **Простота:** Сложные взаимодействия с API, управление историей и обработка инструментов скрыты за простым методом `client.chat()`.
*   **Гибкость:** Настраивайте модели, параметры генерации, хранение истории, безопасность и многое другое.
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
*   **📜 Управление историей:** Автоматическая загрузка, сохранение и обрезка истории диалогов для каждого пользователя или группы.
    *   Гибкая система истории на базе **адаптеров** (`IHistoryStorage`).
    *   В комплекте — адаптеры для памяти (`MemoryHistoryStorage`) и диска (`DiskHistoryStorage`, JSON-файлы).
    *   Легко подключать свои адаптеры (Redis, MongoDB, API и др.).
    *   Настройка TTL, лимитов, интервалов очистки.
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
*   **⚙️ Гибкая конфигурация:** Настройка API ключа, модели по умолчанию, эндпоинта, таймаутов, **прокси**, заголовков (`Referer`, `X-Title`), резервных моделей (`modelFallbacks`), формата ответа (`responseFormat`), лимита вызова инструментов (`maxToolCalls`), отслеживания стоимости (`enableCostTracking`) и многих других параметров через `OpenRouterConfig`.
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
// или для CommonJS: const { OpenRouterClient } = require('openrouter-kit');

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...', // Используйте переменные окружения!
  enableCostTracking: true, // Опционально: включить расчет стоимости
  debug: false,             // Опционально: включить подробные логи
});

async function main() {
  try {
    console.log('Отправка запроса...');
    const result = await client.chat({ // Получаем объект ChatCompletionResult
      prompt: 'Передай привет миру!',
      model: 'google/gemini-2.0-flash-001', // Опционально переопределяем модель
      user: 'test-user-1', // Опционально: для сохранения истории
    });

    console.log('--- Результат ---');
    console.log('Ответ модели:', result.content); // Доступ к контенту через .content
    console.log('Использовано токенов:', result.usage);
    console.log('Использованная модель:', result.model);
    console.log('Количество вызовов инструментов:', result.toolCallsCount);
    console.log('Причина завершения:', result.finishReason);
    console.log('Время выполнения (мс):', result.durationMs);
    if (result.cost !== null) {
      console.log('Примерная стоимость (USD):', result.cost.toFixed(8));
    }
    console.log('ID Запроса:', result.id);

    // Пример получения баланса (если ключ валидный)
    console.log('\nПроверка баланса...');
    const balance = await client.getCreditBalance();
    console.log(`Баланс кредитов: использовано $${balance.usage.toFixed(4)} из $${balance.limit.toFixed(2)}`);

    // Пример получения истории (если user был указан)
    const historyManager = client.getHistoryManager(); // Получаем менеджер истории
    if (historyManager && typeof historyManager.getHistory === 'function') { // Убеждаемся, что это UnifiedHistoryManager
        const history = await historyManager.getHistory('user:test-user-1'); // Ключ формируется внутренне
        console.log(`\nСохранено сообщений в истории для user:test-user-1: ${history.length}`);
    }


  } catch (error: any) {
    // Обработка ошибок (см. раздел "Обработка ошибок")
    console.error(`\n--- Ошибка ---`);
    console.error(`Сообщение: ${error.message}`);
    if (error.code) {
        console.error(`Код ошибки: ${error.code}`);
    }
    if (error.statusCode) {
        console.error(`HTTP Статус: ${error.statusCode}`);
    }
    if (error.details) {
        console.error(`Детали:`, error.details);
    }
    // console.error(error.stack); // Полный стек вызовов для отладки
  } finally {
    console.log('\nЗавершение работы и освобождение ресурсов...');
    // Важно освободить ресурсы (таймеры, кэши)
    await client.destroy();
    console.log('Ресурсы освобождены.');
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
    console.log('Стоимость:', result.cost); // null если enableCostTracking: false
  } catch (error) {
     console.error(`Ошибка: ${error.message}`, error.details || error);
  } finally {
     // Важно освободить ресурсы
     await client.destroy();
  }
}

main();
```

## 🚕 Пример: Такси-бот

Этот пример демонстрирует использование истории диалогов и вызова инструментов (function calling) для создания простого бота-оператора такси.

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Пример конфигурации прокси (если нужно)
// const proxyConfig = {
//   host: "your.proxy.server",
//   port: 8080, // может быть строкой или числом
//   user: "proxy_user", // опционально
//   pass: "proxy_pass", // опционально
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...", // Замените или используйте env!
  model: "google/gemini-2.0-flash-001", // Используем быструю модель
  // Используем адаптер памяти по умолчанию (явно указывать не обязательно)
  // historyAdapter: new MemoryHistoryStorage(), // Эквивалентно отсутствию или historyStorage: 'memory'
  // proxy: proxyConfig, // Раскомментируйте, если используете прокси
  enableCostTracking: true, // Включаем расчет стоимости
  debug: false, // Установите true для подробных логов
  // Настройки безопасности (пример):
  // security: {
  //   defaultPolicy: 'deny-all', // Запрещать все инструменты по умолчанию
  //   toolAccess: { // Разрешить конкретные инструменты
  //       'estimateRideCost': { allow: true },
  //       'acceptOrder': { allow: true },
  //   }
  // }
});

let orderAccepted = false; // Флаг для завершения диалога

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
    // Функция, которая будет выполнена
    execute: async (args) => {
      console.log(`[Инструмент estimateRideCost] Расчет стоимости от ${args.from} до ${args.to}...`);
      // Симуляция расчета стоимости
      const cost = Math.floor(Math.random() * 900) + 100; // Случайная стоимость от 100 до 999
      console.log(`[Инструмент estimateRideCost] Рассчитанная стоимость: ${cost} RUB`);
      // Важно возвращать данные, которые модель сможет использовать
      return {
        estimatedCost: cost,
        currency: "RUB"
      };
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
          // Модель может опционально передать стоимость, если ее помнит
          estimatedCost: { type: "number", description: "Примерная стоимость поездки (если известна)"}
        },
        required: ["from", "to"]
      },
    },
    // Функция, которая будет выполнена
    execute: async (args, context) => { // Доступен context
      console.log(`[Инструмент acceptOrder] Принятие заказа от ${args.from} до ${args.to}...`);
      console.log(`[Инструмент acceptOrder] Заказ инициирован пользователем: ${context?.userInfo?.userId || 'anonymous'}`); // Пример использования context
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Обновляем флаг для завершения
      // Возвращаем строку, которую модель передаст пользователю
      // Это лучше, чем модель будет сама придумывать номер водителя
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

// Системный промпт для модели
const systemPrompt = `Ты — дружелюбный и эффективный оператор службы такси по имени "Кит". Твоя задача - помочь клиенту заказать такси.
1. Уточни адрес отправления ('from') и адрес назначения ('to'), если клиент их не указал. Будь вежлив.
2. Как только адреса известны, ОБЯЗАТЕЛЬНО используй инструмент 'estimateRideCost', чтобы сообщить клиенту примерную стоимость.
3. Дождись, пока клиент подтвердит, что его устраивает стоимость и он готов сделать заказ (например, словами "заказывайте", "хорошо", "да", "подходит").
4. После подтверждения клиента, используй инструмент 'acceptOrder', передав ему адреса 'from' и 'to'.
5. После вызова 'acceptOrder' сообщи клиенту результат, который вернул инструмент.
6. Не придумывай номера водителей или статус заказа сам, полагайся на ответ от инструмента 'acceptOrder'.
7. Если пользователь спрашивает что-то не по теме заказа такси, вежливо верни его к теме.`;

async function chatWithTaxiBot() {
  // Уникальный ID для сессии пользователя (для разделения истории)
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nБот Кит: Здравствуйте! Я ваш виртуальный помощник по заказу такси. Куда поедем? (ID сессии: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("Вы: ");
      if (userMessage.toLowerCase() === 'выход' || userMessage.toLowerCase() === 'quit') {
          console.log("Бот Кит: Спасибо за обращение! До свидания.");
          break;
      }

      console.log("Бот Кит: Минутку, обрабатываю ваш запрос...");
      const result = await client.chat({
        user: userId, // Включаем историю для этого пользователя
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Предоставляем инструменты модели
        model: "openai/gpt-4o-mini", // Можно указать другую модель для примера
        temperature: 0.5, // Немного уменьшим креативность для предсказуемости
        maxToolCalls: 5 // Ограничиваем количество раундов вызова инструментов
      });

      // Выводим ответ модели
      console.log(`\nБот Кит: ${result.content}\n`);

      // Отладочная информация
      if (client.isDebugMode()) { // Используем isDebugMode() для проверки
          console.log(`[Отладка] Модель: ${result.model}, Вызовы инстр.: ${result.toolCallsCount}, Стоимость: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Причина: ${result.finishReason}`);
      }

      // Если инструмент acceptOrder был успешно вызван (по флагу)
      if (orderAccepted) {
        // Сообщение о принятии заказа уже должно быть в result.content,
        // т.к. мы возвращаем строку из execute() инструмента acceptOrder.
        console.log("Бот Кит: Если у вас есть еще вопросы, я готов помочь!");
        // Можно добавить break здесь, если диалог должен завершиться после заказа
        // break;
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
    // Освобождаем ресурсы клиента
    await client.destroy();
    console.log("\nКлиент остановлен. Сессия завершена.");
  }
}

// Запускаем бота
chatWithTaxiBot();
```

## ⚙️ API и Концепции

### `OpenRouterClient`

Основной класс для взаимодействия с библиотекой.

#### Конфигурация (`OpenRouterConfig`)

При создании клиента (`new OpenRouterClient(config)`) передается объект конфигурации со следующими основными полями:

*   `apiKey` (string, **обязательно**): Ваш API ключ OpenRouter. Рекомендуется хранить в переменных окружения (`process.env.OPENROUTER_API_KEY`).
*   `model` (string, опционально): Модель по умолчанию для всех запросов (например, `'google/gemini-2.0-flash-001'`).
*   `debug` (boolean, опционально): Включить подробное логирование всех операций (по умолчанию: `false`).
*   `historyAdapter` (IHistoryStorage, опционально): Экземпляр адаптера для хранения истории (например, `new DiskHistoryStorage('./my-chats')`). Если не указан, используется `MemoryHistoryStorage`.
*   `historyAutoSave` (boolean, опционально): Автоматически сохранять историю при завершении процесса (только для адаптеров, поддерживающих сохранение, например, `DiskHistoryStorage`).
*   `historyTtl` (number, опционально): Время жизни записей истории в миллисекундах (по умолчанию: 24 часа). Записи старше этого времени могут быть удалены при очистке.
*   `historyCleanupInterval` (number, опционально): Как часто запускать фоновую задачу очистки устаревшей истории в миллисекундах (по умолчанию: 1 час).
*   `maxHistoryEntries` (number, опционально): Максимальное количество *сообщений* (не пар) для хранения в истории одного диалога (по умолчанию: 40). Старые сообщения удаляются.
*   `maxToolCalls` (number, опционально): Максимальное количество раундов вызова инструментов (запрос -> вызов -> результат -> запрос) в рамках одного вызова `client.chat()` (по умолчанию: 10). Предотвращает бесконечные циклы.
*   `security` (SecurityConfig, опционально): Объект конфигурации для модуля безопасности. **Критически важно для безопасной обработки инструментов.** (См. [Модуль безопасности](#-модуль-безопасности-securitymanager)).
*   `proxy` (string | object, опционально): Настройки HTTP/HTTPS прокси. Либо URL строка (`'http://user:pass@host:port'`), либо объект (`{ host: string, port: number | string, user?: string, pass?: string }`).
*   `apiEndpoint` (string, опционально): Пользовательский URL API OpenRouter для чата (по умолчанию: `'https://openrouter.ai/api/v1/chat/completions'`).
*   `referer` (string, опционально): Значение заголовка `HTTP-Referer` для запросов к API (для вашей статистики на OpenRouter).
*   `title` (string, опционально): Значение заголовка `X-Title` для запросов к API (для вашей статистики на OpenRouter).
*   `modelFallbacks` (string[], опционально): Список ID резервных моделей, которые будут испробованы по порядку, если запрос к основной модели (`config.model` или `options.model`) завершится ошибкой.
*   `responseFormat` (ResponseFormat, опционально): Формат ответа по умолчанию для всех запросов (например, `{ type: 'json_object' }`). Может быть переопределен в `client.chat()`.
*   `strictJsonParsing` (boolean, опционально): Если `true`, при запросе JSON (`responseFormat`) и получении невалидного JSON будет выброшена ошибка `ValidationError`. Если `false` (по умолчанию), в поле `content` результата будет `null`.
*   `axiosConfig` (AxiosRequestConfig, опционально): Дополнительные настройки, передаваемые напрямую в Axios (например, кастомные заголовки, таймауты, `httpsAgent`).
*   `enableCostTracking` (boolean, опционально): Включить расчет стоимости вызовов (по умолчанию: `false`). Требует дополнительных запросов к `/models` API.
*   `priceRefreshIntervalMs` (number, опционально): Интервал автоматического обновления кэша цен моделей в миллисекундах (по умолчанию: 6 часов).
*   `initialModelPrices` (Record<string, ModelPricingInfo>, опционально): Предоставить начальные цены моделей (например, из вашего конфига или кэша), чтобы избежать первого запроса к `/models` при старте.

#### Основные методы

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Основной метод для отправки запроса модели. Автоматически управляет историей (если `options.user` указан) и обрабатывает вызовы инструментов (если `options.tools` указаны).
    *   `options`: Объект с параметрами запроса (см. `OpenRouterRequestOptions` в `types/index.ts`). Ключевые: `prompt` или `customMessages`, `user?`, `tools?`, `model?`, `systemPrompt?`, `accessToken?`, `maxToolCalls?`, `responseFormat?`, `temperature?`, `maxTokens?` и др.
    *   Возвращает `Promise<ChatCompletionResult>` - объект с полями:
        *   `content`: Финальный ответ модели (строка, объект JSON или `null` при ошибке парсинга JSON).
        *   `usage`: Суммарное использование токенов за весь цикл `chat()` (включая вызовы инструментов): `{ prompt_tokens, completion_tokens, total_tokens }` или `null`.
        *   `model`: ID модели, сгенерировавшей *финальный* ответ.
        *   `toolCallsCount`: Общее количество *успешно выполненных* вызовов инструментов в рамках этого `chat()`.
        *   `finishReason`: Причина завершения генерации *финального* ответа (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
        *   `durationMs`: Общее время выполнения метода `chat()` в миллисекундах.
        *   `id`: ID *последнего* запроса к API OpenRouter.
        *   `cost`: Рассчитанная стоимость (USD) всего вызова `chat()` или `null`, если отслеживание выключено (`enableCostTracking: false`) или цены для использованных моделей неизвестны.
*   `setModel(model: string)`: Устанавливает модель по умолчанию для последующих вызовов `chat()`.
*   `setApiKey(apiKey: string)`: Обновляет API ключ, используемый для запросов.
*   `createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string`: Создает JWT токен доступа. Требует, чтобы `SecurityManager` был сконфигурирован для JWT (`userAuthentication.type: 'jwt'` и `jwtSecret` задан).
*   `getCreditBalance(): Promise<CreditBalance>`: Запрашивает текущий баланс кредитов OpenRouter для используемого API ключа. Возвращает `{ limit: number, usage: number }`.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Возвращает объект с закэшированными ценами моделей (`{ promptCostPerMillion, completionCostPerMillion, ... }`). Актуально, если `enableCostTracking: true`.
*   `refreshModelPrices(): Promise<void>`: Принудительно запускает обновление кэша цен моделей из API OpenRouter. Актуально, если `enableCostTracking: true`.
*   `on(event: string, handler: (payload: any) => void)`: Подписка на события.
    *   `'error'`: Глобальные ошибки библиотеки (payload: `OpenRouterError`).
    *   События безопасности (если `SecurityManager` включен): `'access:denied'`, `'ratelimit:exceeded'`, `'security:dangerous_args'`, `'token:invalid'`, `'user:authenticated'`, `'tool:call'` и др. (см. `SecurityManager`).
*   `off(event: string, handler: (payload: any) => void)`: Отписка от событий.
*   `getHistoryManager(): UnifiedHistoryManager | undefined`: Возвращает экземпляр менеджера истории (если используется).
*   `getSecurityManager(): SecurityManager | null`: Возвращает экземпляр менеджера безопасности (если сконфигурирован).
*   `getCostTracker(): CostTracker | null`: Возвращает экземпляр трекера стоимости (если включен).
*   `isDebugMode(): boolean`: Проверяет, включен ли режим отладки.
*   `use(plugin: OpenRouterPlugin): Promise<void>`: Регистрация плагина.
*   `useMiddleware(fn: MiddlewareFunction): void`: Регистрация middleware-функции.
*   `destroy(): Promise<void>`: **ВАЖНО!** Освобождает все ресурсы, используемые клиентом (останавливает таймеры очистки истории и обновления цен, очищает кэши, удаляет обработчики `process.exit` если были). **Необходимо вызывать при завершении работы с клиентом**, особенно в серверных приложениях или тестах, чтобы избежать утечек памяти и незавершенных процессов.

### 🧩 Плагины и Middleware

Плагины и middleware предоставляют мощные механизмы для расширения и кастомизации функциональности `OpenRouterClient`.

**Плагины (`client.use(plugin)`):**

*   Это основной способ добавить сложную или интегрированную функциональность.
*   Плагин - это объект с асинхронным или синхронным методом `init(client: OpenRouterClient)`.
*   Внутри `init` плагин может:
    *   Регистрировать middleware (`client.useMiddleware(...)`).
    *   Подписываться на события клиента или его менеджеров (`client.on(...)`).
    *   Заменять стандартные менеджеры (истории, безопасности, стоимости) на свои реализации, используя `client.setHistoryManager(...)`, `client.setSecurityManager(...)`, `client.setCostTracker(...)`. *Примечание: эти сеттеры могут быть непубличными и доступны через `client['propertyName'] = ...` или добавлены в API.*
    *   Добавлять новые методы или свойства к экземпляру клиента (`client.myCustomMethod = ...`).
*   **Примеры:** Интеграция с внешними системами мониторинга, реализация кастомной логики аутентификации, добавление сложного кэширования ответов.

**Готовые плагины (в директории `plugins/`):**

*   `createRedisHistoryPlugin(redisUrl, prefix?)`: Заменяет стандартный менеджер истории на `UnifiedHistoryManager` с адаптером для Redis. Требует установки `ioredis`.
    ```typescript
    import { createRedisHistoryPlugin } from 'openrouter-kit/plugins';
    // const { createRedisHistoryPlugin } = require('openrouter-kit/plugins'); // CommonJS
    // Установите: npm install ioredis
    await client.use(createRedisHistoryPlugin('redis://localhost:6379'));
    ```
*   Другие плагины в директории (`ExternalSecurity`, `BillingCostTracker`, `LoggingMiddleware`, `CustomToolRegistry`) служат примерами для создания ваших собственных.

**Middleware (`client.useMiddleware(fn)`):**

*   Функции, выполняющиеся до и/или после основного запроса к API внутри `client.chat()`.
*   Используют стандартный паттерн `async (ctx, next) => { ... await next(); ... }`.
*   `ctx` (MiddlewareContext): Объект с `request` (входящие опции) и `response` (результат или ошибка). Middleware может модифицировать эти поля.
*   `next`: Функция для вызова следующего middleware или основного обработчика `chat`.
*   **Примеры:** Логирование запросов/ответов, модификация опций запроса (добавление заголовков, изменение модели), кэширование ответов, проверка бюджета перед запросом, аудит действий.

**Пример Middleware для ограничения стоимости запроса:**

```typescript
client.useMiddleware(async (ctx, next) => {
  const MAX_COST_PER_CALL = 0.01; // Максимум $0.01 за вызов
  const costTracker = client.getCostTracker();
  const model = ctx.request.options.model || client.model; // Определяем модель

  if (costTracker) {
    // Приблизительная оценка стоимости *до* вызова (может быть неточной без знания токенов)
    // Здесь можно добавить логику для проверки баланса или лимитов пользователя
    console.log(`[Middleware Cost Check] Вызов к модели ${model}.`);
  }

  await next(); // Выполняем основной запрос и другие middleware

  // Проверяем стоимость *после* вызова
  if (ctx.response?.result?.cost && ctx.response.result.cost > MAX_COST_PER_CALL) {
    console.warn(`[Middleware Cost Alert] Стоимость вызова (${ctx.response.result.cost.toFixed(6)}$) превысила лимит ${MAX_COST_PER_CALL}$`);
    // Здесь можно добавить логику уведомлений или блокировки дальнейших запросов
  }
});
```

### 📜 Управление историей (Адаптеры)

Библиотека использует `UnifiedHistoryManager` для управления историей диалогов, который работает поверх абстрактного интерфейса `IHistoryStorage` (адаптера). Это позволяет легко менять способ хранения истории.

*   **Адаптер (`IHistoryStorage`):** Интерфейс, определяющий методы `load`, `save`, `delete`, `listKeys`.
*   **Встроенные адаптеры:**
    *   `MemoryHistoryStorage`: Хранит историю в памяти (по умолчанию). Подходит для простых случаев и тестирования. Данные теряются при перезапуске.
    *   `DiskHistoryStorage`: Хранит историю в JSON-файлах на диске. Настраивается через `chatsFolder` в конфиге клиента. Подходит для сохранения истории между сессиями на одном сервере.
*   **Конфигурация:**
    *   `historyAdapter`: Передайте экземпляр вашего адаптера (например, `new DiskHistoryStorage('./data/chats')`) или используйте `historyStorage: 'disk'` для встроенного дискового адаптера.
    *   `maxHistoryEntries`, `historyTtl`, `historyCleanupInterval`, `historyAutoSave` настраивают поведение менеджера истории.
*   **Использование:** Просто передавайте `user` (и опционально `group`) в `client.chat()`. Менеджер автоматически загрузит, использует и сохранит историю для ключа, сформированного из `user` и `group`.
*   **Кастомные адаптеры:** Вы можете реализовать `IHistoryStorage` для любого хранилища (БД, Redis, облачное хранилище). Пример - `RedisHistoryStorage` (используется в `createRedisHistoryPlugin`).

**Пример с Disk Storage:**

```typescript
import OpenRouter from 'openrouter-kit';
import { DiskHistoryStorage } from 'openrouter-kit/history'; // Импорт адаптера

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  historyAdapter: new DiskHistoryStorage('./.my-chat-history'), // Указываем папку
  maxHistoryEntries: 50, // Хранить больше сообщений
  historyAutoSave: true, // Сохранять при выходе
});

// Дальнейшее использование client.chat({ user: '...', prompt: '...' })
// будет сохранять историю в папку ./.my-chat-history
```

### 🛠️ Обработка инструментов (Function Calling)

Позволяет LLM вызывать ваши функции для получения информации или выполнения действий.

1.  **Определение Инструмента (`Tool`):**
    *   `type: 'function'` (пока единственный тип).
    *   `function`: Объект с описанием для LLM:
        *   `name` (string): Имя функции.
        *   `description` (string, опционально): Описание того, что делает функция (важно для LLM).
        *   `parameters` (object, опционально): JSON Schema, описывающая ожидаемые аргументы функции. Используется для валидации.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Ваша функция**, которая будет вызвана. Получает распарсенные и провалидированные аргументы (`args`) и опциональный контекст (`context`), содержащий `userInfo` (если пользователь аутентифицирован) и `securityManager`. Должна возвращать результат, который будет сериализован в JSON и отправлен обратно LLM.
    *   `security` (ToolSecurity, опционально): Специфичные для инструмента правила безопасности (например, `requiredRole`, `rateLimit`).

2.  **Использование в `chat()`:**
    *   Передайте массив определенных инструментов в `options.tools`.
    *   Библиотека автоматически:
        *   Отправит определения инструментов модели.
        *   Если модель решит вызвать инструмент (`finish_reason: 'tool_calls'`), библиотека:
            *   Распарсит аргументы из ответа модели (`ToolCall.function.arguments`).
            *   Провалидирует аргументы по JSON Schema (`Tool.function.parameters`).
            *   **Выполнит проверки безопасности** (`SecurityManager`, если настроен): доступ (ACL), лимиты (Rate Limit), санитизация аргументов.
            *   Вызовет вашу функцию `execute(args, context)`.
            *   Отправит результат (или ошибку выполнения) обратно модели в сообщении с `role: 'tool'`.
            *   Получит финальный ответ от модели (с `role: 'assistant'`).
    *   `options.maxToolCalls`: Ограничивает количество таких циклов "запрос-вызов-результат".
    *   `options.toolChoice`: Позволяет принудительно выбрать инструмент или запретить их вызов (`'none'`, `'auto'`, `{ type: "function", function: { name: "my_func" } }`).

3.  **Результат:** Финальный ответ модели будет в `ChatCompletionResult.content`. `ChatCompletionResult.toolCallsCount` покажет, сколько инструментов было вызвано.

### 🔒 Модуль безопасности (`SecurityManager`)

Обеспечивает комплексную защиту при работе с инструментами. Активируется передачей объекта `security: SecurityConfig` в конструктор клиента.

**Компоненты:**

*   `AuthManager`: Аутентификация (JWT по умолчанию).
*   `AccessControlManager`: Проверка прав доступа к инструментам (ACL).
*   `RateLimitManager`: Управление лимитами вызовов.
*   `ArgumentSanitizer`: Проверка аргументов на опасное содержимое.

**Конфигурация (`SecurityConfig`):**

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): Доступ по умолчанию к инструментам, если нет явных правил. Рекомендуется `'deny-all'`.
*   `requireAuthentication` (boolean): Если `true`, для вызова *любого* инструмента требуется валидный `accessToken`.
*   `allowUnauthenticatedAccess` (boolean): Если `true` и `requireAuthentication: false`, разрешает вызов инструментов, явно разрешенных для анонимных пользователей, без `accessToken`.
*   `userAuthentication` (`UserAuthConfig`): Настройка аутентификации.
    *   `type`: `'jwt'`, `'api-key'`, `'custom'`.
    *   `jwtSecret`: **ОБЯЗАТЕЛЬНО** для `type: 'jwt'`. Используйте надежный секрет из переменных окружения. **Никогда не используйте секрет по умолчанию в production!**
    *   `customAuthenticator`: Функция для проверки кастомных токенов/ключей.
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Правила доступа для каждого инструмента по его имени (или `*` для всех).
    *   `allow` (boolean): Явно разрешить/запретить.
    *   `roles` (string | string[]): Роли, которым разрешен доступ.
    *   `scopes` (string | string[]): Разрешения, которым разрешен доступ.
    *   `rateLimit` (`RateLimit`): Лимит вызовов для этого инструмента (переопределяет лимиты роли).
    *   `allowedApiKeys` (string[]): Конкретные API-ключи, которым разрешен доступ.
*   `roles` (`RolesConfig`): Определение ролей.
    *   `roles`: Объект, где ключ - имя роли, значение - `RoleConfig`:
        *   `allowedTools` (string | string[]): Инструменты, разрешенные для роли (`*` для всех).
        *   `rateLimits` (`Record<string, RateLimit>`): Лимиты вызовов для этой роли (ключ - имя инструмента или `*`).
*   `dangerousArguments` (`DangerousArgumentsConfig`): Настройка санитизации аргументов.
    *   `globalPatterns`, `toolSpecificPatterns`, `extendablePatterns` (RegExp[] | string[]): Паттерны для поиска опасного содержимого.
    *   `blockedValues` (string[]): Запрещенные подстроки.
    *   `auditOnlyMode` (boolean): Если `true`, опасные аргументы будут залогированы, но вызов не будет заблокирован.

**Использование:**

1.  Сконфигурируйте `SecurityManager`, передав `security: securityConfig` в конструктор клиента.
2.  При вызове `client.chat()` передавайте `accessToken: 'your_jwt_token'` в опциях, если требуется аутентификация.
3.  `SecurityManager` автоматически выполнит все проверки перед вызовом `execute` инструмента. При нарушении будет выброшена соответствующая ошибка (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`).
4.  Используйте `client.createAccessToken(userInfo, expiresIn?)` для генерации JWT.
5.  Подписывайтесь на события безопасности (`access:denied`, `ratelimit:exceeded` и т.д.) через `client.on(...)` для мониторинга.

### 📈 Отслеживание стоимости (Cost Tracking)

Позволяет оценить затраты на использование API OpenRouter.

**Включение:** `enableCostTracking: true` в конфиге клиента.

**Механизм:**

1.  `CostTracker` инициализируется вместе с клиентом.
2.  Он периодически (по умолчанию раз в 6 часов, настраивается через `priceRefreshIntervalMs`) запрашивает цены моделей с эндпоинта `https://openrouter.ai/api/v1/models`.
3.  Цены кэшируются. Можно предоставить начальные цены через `initialModelPrices`.
4.  После каждого вызова `chat()`, `CostTracker.calculateCost(model, usage)` вызывается для расчета стоимости на основе токенов (`usage`) и закэшированных цен.
5.  Результат добавляется в `ChatCompletionResult.cost`.

**Методы клиента:**

*   `getCreditBalance(): Promise<CreditBalance>`: Получить лимит и текущее использование кредитов.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Получить кэш цен.
*   `refreshModelPrices(): Promise<void>`: Обновить кэш цен принудительно.
*   `getCostTracker(): CostTracker | null`: Получить экземпляр трекера.

**Точность:** Расчет является **приблизительным**, так как точные цены и способ их применения могут меняться на стороне OpenRouter.

### ⚙️ Формат ответа (`responseFormat`)

Принуждает модель генерировать ответ в формате JSON. Используется как в конфиге клиента (для ответа по умолчанию), так и в опциях `client.chat()` (для конкретного запроса).

*   `{ type: 'json_object' }`: Требует любой валидный JSON объект.
*   `{ type: 'json_schema', json_schema: { name: 'MySchema', schema: { ... } } }`: Требует JSON, соответствующий предоставленной JSON Schema. `name` - произвольное имя для схемы, `schema` - сам объект JSON Schema.

**Важно:**
*   Не все модели поддерживают `responseFormat`.
*   При использовании `responseFormat`, модель может генерировать только JSON. Обычный текстовый ответ будет невозможен в том же вызове.
*   **Обработка ошибок парсинга:**
    *   Если `strictJsonParsing: false` (по умолчанию): При невалидном JSON или несоответствии схеме, `ChatCompletionResult.content` будет `null`.
    *   Если `strictJsonParsing: true`: Будет выброшена ошибка `ValidationError`.

### ⚠️ Обработка ошибок

Библиотека использует иерархию кастомных ошибок, наследуемых от `OpenRouterError`.

*   **`OpenRouterError`**: Базовый класс. Содержит `message`, `code` (из `ErrorCode`), `statusCode?`, `details?`.
*   **Подклассы:** `APIError`, `ValidationError`, `NetworkError`, `AuthenticationError`, `AuthorizationError`, `AccessDeniedError`, `ToolError`, `RateLimitError`, `TimeoutError`, `ConfigError`, `SecurityError`.
*   **`ErrorCode` (enum):** Строковые коды для идентификации типа ошибки (например, `ErrorCode.RATE_LIMIT_ERROR`, `ErrorCode.DANGEROUS_ARGS`).
*   **`mapError(error: any)`:** Внутренняя функция (экспортируется) для преобразования ошибок Axios или стандартных `Error` в `OpenRouterError`.

**Рекомендации:**

*   Используйте `try...catch` вокруг вызовов `client.chat()` и других методов.
*   Проверяйте тип ошибки через `instanceof` (например, `error instanceof RateLimitError`) или `error.code` (например, `error.code === ErrorCode.VALIDATION_ERROR`).
*   Используйте `error.statusCode` для HTTP статуса (если применимо).
*   Проверяйте `error.details` для дополнительной информации.
*   Подписывайтесь на событие `'error'` клиента для глобальной обработки ошибок: `client.on('error', (err) => console.error('Global Error:', err));`.

### 📝 Логирование

*   Встроенный `Logger` используется по всей библиотеке.
*   Активируется флагом `debug: true` в конфигурации клиента.
*   Выводит сообщения с префиксами (например, `[SecurityManager]`, `[CostTracker]`) для легкой идентификации источника.
*   Использует `console.log`, `console.debug`, `console.warn`, `console.error`.

### 🌐 Прокси

Настройте HTTP/HTTPS прокси через поле `proxy` в `OpenRouterConfig`:

```typescript
// URL строка
const client1 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:pass@your-proxy.com:8080'
});

// Объект
const client2 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: {
      host: 'proxy.example.com',
      port: 8888, // Может быть числом или строкой
      user: 'optional_user', // опционально
      pass: 'optional_pass' // опционально
  }
});
```

## 📄 Лицензия

[MIT](./LICENSE)