
/**
 * Основной класс модуля безопасности.
 * Координирует работу AuthManager, AccessControlManager, RateLimitManager и ArgumentSanitizer.
 * Предоставляет единый интерфейс для проверки доступа, аутентификации и логирования событий безопасности.
 */

import {
  ISecurityManager,
  SecurityCheckParams,
  SecurityContext,
  ExtendedToolCallEvent,
  SecurityConfig as TypeSecurityConfig,
  UserAuthInfo as TypeUserAuthInfo,
  IAuthManager,
  IAccessControlManager,
  IRateLimitManager,
  IArgumentSanitizer,
  ISecurityEventEmitter,
  RateLimit
} from './types';
import { SecurityEventEmitter } from './security-event-emitter';
import { AuthManager } from './auth-manager';
import { RateLimitManager } from './rate-limit-manager';
import { AccessControlManager } from './access-control-manager';
import { ArgumentSanitizer } from './argument-sanitizer';
import { Logger } from '../utils/logger';
import { Tool } from '../types'; // Импортируем базовый Tool
import {
  AccessDeniedError,
  AuthorizationError,
  RateLimitError as ToolRateLimitError,
  SecurityError,
  ConfigError,
} from '../utils/error';

// Используем переименованные типы внутри модуля
type SecurityConfig = TypeSecurityConfig;
type UserAuthInfo = TypeUserAuthInfo;

export class SecurityManager implements ISecurityManager {
  private config: SecurityConfig;
  private eventEmitter: ISecurityEventEmitter;
  private authManager: IAuthManager;
  private rateLimitManager: IRateLimitManager;
  private accessControlManager: IAccessControlManager;
  private argumentSanitizer: IArgumentSanitizer;
  private debug: boolean;
  private logger: Logger;

  /**
   * Создает экземпляр SecurityManager.
   *
   * @param config - Конфигурация безопасности.
   * @param secretKeyOrDebug - Опционально: секретный ключ JWT (строка) или флаг отладки (boolean).
   *                         Если передан ключ, он переопределит `config.userAuthentication.jwtSecret`.
   *                         Если передан boolean, он переопределит `config.debug`.
   */
  constructor(config?: Partial<SecurityConfig>, secretKeyOrDebug?: string | boolean) {
    // Устанавливаем конфигурацию по умолчанию
    const defaultConfig: SecurityConfig = {
        defaultPolicy: 'deny-all', // Безопасная политика по умолчанию
        debug: false,
        requireAuthentication: false,
        allowUnauthenticatedAccess: false,
    };
    // Сливаем дефолтную конфигурацию с переданной
    this.config = { ...defaultConfig, ...(config || {}) };

    let jwtSecret = this.config.userAuthentication?.jwtSecret || '';
    this.debug = this.config.debug ?? false;

    // Обработка второго аргумента (либо ключ, либо флаг отладки)
    if (typeof secretKeyOrDebug === 'string') {
      jwtSecret = secretKeyOrDebug;
      // Обновляем секрет в конфигурации для консистентности
      if (!this.config.userAuthentication) this.config.userAuthentication = {};
      this.config.userAuthentication.jwtSecret = jwtSecret;
      this.debug = this.config.debug ?? false; // debug берем из конфига
    } else if (typeof secretKeyOrDebug === 'boolean') {
      this.debug = secretKeyOrDebug;
      // Обновляем debug в конфигурации
      this.config.debug = this.debug;
      // jwtSecret остается из конфига
    }

    this.logger = new Logger({ debug: this.debug, prefix: 'SecurityManager' });

    this.eventEmitter = new SecurityEventEmitter();
    const finalJwtSecret = jwtSecret || 'MISSING_SECRET'; // Используем плейсхолдер, если секрет не задан

    if (finalJwtSecret === 'MISSING_SECRET' && this.config.userAuthentication?.type === 'jwt') {
         this.logger.error('Критическая уязвимость: JWT аутентификация включена, но JWT Secret не предоставлен! Установите секрет через конфигурацию, конструктор или переменную окружения JWT_SECRET.');
         // Не выбрасываем ошибку, позволяем инициализировать, но JWT работать не будет.
    } else if (finalJwtSecret === 'default-secret-replace-in-production' && this.config.userAuthentication?.type === 'jwt') {
         this.logger.error('Критическая уязвимость: Используется небезопасный JWT секрет по умолчанию. Замените его в production!');
    }

    // Создаем экземпляры под-менеджеров, передавая им eventEmitter и логгер
    this.authManager = new AuthManager(finalJwtSecret, this.eventEmitter, this.logger.withPrefix('AuthManager'));
    this.rateLimitManager = new RateLimitManager(this.eventEmitter, this.logger.withPrefix('RateLimitManager'));
    this.accessControlManager = new AccessControlManager(this.eventEmitter, this.logger.withPrefix('AccessControlManager'));
    this.argumentSanitizer = new ArgumentSanitizer(this.eventEmitter, this.logger.withPrefix('ArgumentSanitizer'));

    // Устанавливаем режим отладки для всех компонентов
    this.setDebugMode(this.debug);

    this.logger.log(`SecurityManager инициализирован. Debug: ${this.debug}. Default Policy: ${this.config.defaultPolicy}.`);
    if (this.debug) {
      // Логируем конфигурацию без секрета JWT
      const configToLog = { ...this.config };
      if (configToLog.userAuthentication?.jwtSecret) {
           configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
      }
      this.logger.debug(`Начальная конфигурация:`, configToLog);
    }
  }

  /**
   * Возвращает текущую конфигурацию безопасности.
   * @returns {SecurityConfig}
   */
  getConfig(): SecurityConfig {
    // Возвращаем копию, чтобы предотвратить прямое изменение
    return { ...this.config };
  }

  /**
   * Обновляет конфигурацию безопасности.
   * Новые значения сливаются с существующей конфигурацией.
   * Обновляет режим отладки у всех подкомпонентов, если он изменился.
   * @param configUpdate - Объект с полями конфигурации для обновления.
   */
  updateConfig(configUpdate: Partial<SecurityConfig>): void {
    this.logger.log('Обновление конфигурации SecurityManager...');
    // Сливаем текущую конфигурацию с обновлением
    this.config = { ...this.config, ...configUpdate };

    // Особая обработка вложенных объектов (например, userAuthentication)
    if (configUpdate.userAuthentication) {
        this.config.userAuthentication = {
            ...(this.config.userAuthentication || {}),
            ...configUpdate.userAuthentication
        };
    }
     if (configUpdate.toolAccess) {
         this.config.toolAccess = {
             ...(this.config.toolAccess || {}),
             ...configUpdate.toolAccess
         };
     }
      if (configUpdate.roles) {
          this.config.roles = {
              ...(this.config.roles || {}),
              ...configUpdate.roles
          };
          // Глубокое слияние для roles.roles?
          if(configUpdate.roles.roles) {
              this.config.roles.roles = {
                  ...(this.config.roles.roles || {}),
                  ...configUpdate.roles.roles
              }
          }
      }
       if (configUpdate.dangerousArguments) {
           this.config.dangerousArguments = {
               ...(this.config.dangerousArguments || {}),
               ...configUpdate.dangerousArguments
           };
       }
       // TODO: Добавить слияние для других вложенных структур, если они появятся

    // Проверяем, изменился ли флаг отладки
    const newDebug = this.config.debug ?? this.debug; // Берем из новой конфиг или оставляем старый
    if (newDebug !== this.debug) {
        this.setDebugMode(newDebug); // Применяем новый режим отладки
    }

    // Проверяем JWT секрет после обновления
    const newJwtSecret = this.config.userAuthentication?.jwtSecret;
    if (newJwtSecret && (newJwtSecret === 'MISSING_SECRET' || newJwtSecret === 'default-secret-replace-in-production') && this.config.userAuthentication?.type === 'jwt') {
       this.logger.error('Критическая уязвимость: JWT секрет в конфигурации небезопасен или отсутствует после обновления!');
    }

    this.eventEmitter.emit('config:updated', { config: this.config });
    this.logger.log(`Конфигурация безопасности обновлена.`);
    if (this.debug) {
         const configToLog = { ...this.config };
          if (configToLog.userAuthentication?.jwtSecret) {
               configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
          }
         this.logger.debug(`Новая конфигурация:`, configToLog);
    }
  }

  /**
   * Аутентифицирует пользователя по токену доступа.
   * @param accessToken - Токен доступа (например, JWT).
   * @returns Промис с информацией о пользователе (`UserAuthInfo`) или `null`, если аутентификация не удалась.
   */
  async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> {
    return this.authManager.authenticateUser(accessToken);
  }

  /**
   * Создает JWT токен доступа для пользователя.
   * @param userInfo - Данные пользователя для payload токена (кроме `expiresAt`).
   * @param expiresIn - Время жизни токена (например, '24h'). По умолчанию '24h'.
   * @returns {string} Сгенерированный JWT токен.
   * @throws {ConfigError} Если тип аутентификации не 'jwt'.
   * @throws {SecurityError} Если JWT секрет не настроен или произошла ошибка подписи.
   */
  createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn: string = '24h'): string {
   if (this.config.userAuthentication?.type !== 'jwt') {
       this.logger.error(`Попытка создать JWT токен, но тип аутентификации установлен как '${this.config.userAuthentication?.type || 'не jwt'}'.`);
       throw new ConfigError("Создание токена поддерживается только для JWT аутентификации (userAuthentication.type='jwt').", 'CONFIGURATION_ERROR');
   }
   // Делегируем AuthManager
   return this.authManager.createAccessToken({ payload: userInfo, expiresIn });
  }

  /**
   * Выполняет комплексную проверку перед вызовом инструмента: доступ, лимиты, аргументы.
   *
   * @param tool - Определение инструмента.
   * @param userInfo - Информация об аутентифицированном пользователе (или null).
   * @param args - Распарсенные аргументы инструмента.
   * @returns {Promise<boolean>} Промис, который разрешается в `true`, если все проверки пройдены.
   * @throws {AccessDeniedError} Если доступ запрещен политиками или ролями.
   * @throws {AuthorizationError} Если требуется аутентификация, а пользователь не аутентифицирован.
   * @throws {ToolRateLimitError} Если превышен лимит запросов для пользователя/инструмента.
   * @throws {SecurityError} Если обнаружены опасные аргументы.
   * @throws {ValidationError} Если аргументы не соответствуют схеме (проверка выполняется в ToolHandler).
   */
  async checkToolAccessAndArgs(
    tool: Tool,
    userInfo: UserAuthInfo | null,
    args?: any
  ): Promise<boolean> {
    const toolName = tool.function?.name || tool.name || 'unknown_tool';
    const userIdForLog = userInfo?.userId || (this.config.allowUnauthenticatedAccess ? 'анонимный' : 'НЕ АУТЕНТИФИЦИРОВАН');
    this.logger.debug(`Начало проверки доступа и аргументов для инструмента: ${toolName}, пользователь: ${userIdForLog}`);

    try {
      // Создаем контекст для проверок
      const context: SecurityContext = {
        config: this.config,
        debug: this.isDebugEnabled(),
        userId: userInfo?.userId,
        toolName: toolName
      };
      const params: SecurityCheckParams = { tool, userInfo, args, context, securityManager: this };

      // 1. Проверка аутентификации (если требуется глобально или для доступа)
      if (!userInfo && !this.config.allowUnauthenticatedAccess) {
          // Дополнительно проверяем, требует ли сам инструмент аутентификации (через роли/скоупы)
          const toolSecurity = tool.security || tool.function?.security;
          if (toolSecurity?.requiredRole || toolSecurity?.requiredScopes) {
               this.logger.warn(`Доступ к инструменту '${toolName}' требует аутентификации (роли/скоупы), но пользователь не аутентифицирован.`);
               throw new AuthorizationError(`Доступ к инструменту '${toolName}' требует аутентификации.`);
          }
          // Если инструмент не требует аутентификации, но allowUnauthenticatedAccess=false,
          // все равно можем разрешить, если defaultPolicy='allow-all'? Нет, будем строгими.
           this.logger.warn(`Доступ к инструменту '${toolName}' запрещен: неаутентифицированный доступ отключен (allowUnauthenticatedAccess=false).`);
           throw new AuthorizationError(`Доступ для неаутентифицированных пользователей запрещен.`);
      }

      // 2. Проверка прав доступа (Access Control)
      this.logger.debug(`[${toolName}] Шаг 1: Проверка прав доступа (AccessControlManager)...`);
      await this.accessControlManager.checkAccess(params);
      this.logger.debug(`[${toolName}] Доступ разрешен для пользователя: ${userIdForLog}`);

      // 3. Проверка лимитов запросов (Rate Limiting)
      // Лимиты применяются только к аутентифицированным пользователям
      if (userInfo) {
          const rateLimitConfig = this._findRateLimit(tool, userInfo);
          if (rateLimitConfig) {
            this.logger.debug(`[${toolName}] Шаг 2: Проверка Rate Limit (RateLimitManager) для пользователя ${userInfo.userId}, лимит: ${JSON.stringify(rateLimitConfig)}`);
            const rateLimitResult = this.rateLimitManager.checkRateLimit({
                userId: userInfo.userId,
                toolName: toolName,
                rateLimit: rateLimitConfig,
                source: rateLimitConfig._source // Источник лимита для логирования
            });
            if (!rateLimitResult.allowed) {
              const timeLeft = rateLimitResult.timeLeft ?? 0;
              this.logger.warn(`[${toolName}] Превышен Rate Limit для пользователя ${userInfo.userId}. Повторите через ${Math.ceil(timeLeft / 1000)} сек.`);
              throw new ToolRateLimitError(
                  `Превышен лимит запросов (${rateLimitResult.limit} за ${rateLimitConfig.interval || rateLimitConfig.period}) для инструмента '${toolName}'. Повторите попытку позже.`,
                  429, // HTTP статус 429 Too Many Requests
                  { timeLeft: timeLeft, limit: rateLimitResult.limit, period: rateLimitConfig.interval || rateLimitConfig.period }
              );
            }
             this.logger.debug(`[${toolName}] Rate Limit пройден для пользователя ${userInfo.userId}.`);
          } else {
              this.logger.debug(`[${toolName}] Конфигурация Rate Limit не найдена для пользователя ${userInfo.userId}, проверка пропущена.`);
          }
      } else {
           this.logger.debug(`[${toolName}] Пользователь не аутентифицирован, проверка Rate Limit пропущена.`);
      }

      // 4. Проверка опасных аргументов (Argument Sanitizer)
      if (args !== undefined && args !== null) {
        this.logger.debug(`[${toolName}] Шаг 3: Проверка аргументов на безопасность (ArgumentSanitizer)...`);
        await this.argumentSanitizer.validateArguments(tool, args, context);
        this.logger.debug(`[${toolName}] Аргументы прошли проверку на безопасность.`);
      } else {
           this.logger.debug(`[${toolName}] Аргументы отсутствуют, проверка на безопасность пропущена.`);
      }

      // Все проверки пройдены
      this.logger.log(`Все проверки безопасности для инструмента '${toolName}' (пользователь: ${userIdForLog}) пройдены успешно.`);
      return true;

    } catch (error) {
      // Ловим ошибки AccessDeniedError, AuthorizationError, RateLimitError, SecurityError, ConfigError
      const mappedError = error instanceof AccessDeniedError || error instanceof AuthorizationError || error instanceof ToolRateLimitError || error instanceof SecurityError || error instanceof ConfigError
        ? error // Ошибка уже нужного типа
        : new SecurityError(`Неожиданная ошибка при проверке безопасности инструмента ${toolName}: ${(error as Error).message}`, 'CHECK_FAILED', 500, error);

      this.logger.error(`Ошибка при проверке доступа/аргументов к инструменту '${toolName}': ${mappedError.message}`, mappedError.details || mappedError);
      // Эмитим событие об ошибке безопасности
      this.eventEmitter.emit('security:error', {
          toolName,
          userId: userInfo?.userId,
          error: mappedError
      });
      throw mappedError; // Пробрасываем ошибку дальше
    }
  }

 /**
  * Находит наиболее подходящую конфигурацию RateLimit для данного инструмента и пользователя.
  * Приоритет поиска:
  * 1. `roles.roles[userRole].rateLimits[toolName]`
  * 2. `roles.roles[userRole].rateLimits['*']`
  * 3. `toolAccess[toolName].rateLimit`
  * 4. `toolAccess['*'].rateLimit`
  * 5. `tool.security.rateLimit`
  *
  * @param tool - Определение инструмента.
  * @param userInfo - Информация об аутентифицированном пользователе.
  * @returns {RateLimit | undefined} Найденная конфигурация RateLimit или undefined.
  * @private
  */
 private _findRateLimit(tool: Tool, userInfo: UserAuthInfo): (RateLimit & { _source?: string }) | undefined {
   // Лимиты применяются только к аутентифицированным пользователям
   if (!userInfo) return undefined;

   const toolName = tool.function?.name || tool.name;
   if (!toolName) return undefined; // Невозможно найти лимит без имени инструмента

   const config = this.config; // Используем текущую конфигурацию
   const toolSecurity = tool.security || tool.function?.security;
   let foundRateLimit: (RateLimit & { _source?: string }) | undefined;

   const userRole = userInfo.role; // Основная роль

   // 1. Проверка лимитов для конкретной роли и конкретного инструмента
   if (config?.roles?.roles && userRole && config.roles.roles[userRole]?.rateLimits?.[toolName]) {
     foundRateLimit = { ...config.roles.roles[userRole].rateLimits![toolName], _source: `role '${userRole}' / tool '${toolName}'` };
     this.logger.debug(`Найден RateLimit (1): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   // 2. Проверка лимитов для конкретной роли и всех инструментов ('*')
   if (config?.roles?.roles && userRole && config.roles.roles[userRole]?.rateLimits?.['*']) {
     foundRateLimit = { ...config.roles.roles[userRole].rateLimits!['*'], _source: `role '${userRole}' / tool '*'` };
     this.logger.debug(`Найден RateLimit (2): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   // 3. Проверка лимитов в toolAccess для конкретного инструмента
   if (config?.toolAccess?.[toolName]?.rateLimit) {
     foundRateLimit = { ...config.toolAccess[toolName].rateLimit!, _source: `toolAccess '${toolName}'` };
     this.logger.debug(`Найден RateLimit (3): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   // 4. Проверка лимитов в toolAccess для всех инструментов ('*')
   if (config?.toolAccess?.['*']?.rateLimit) {
       foundRateLimit = { ...config.toolAccess['*'].rateLimit!, _source: `toolAccess '*'` };
       this.logger.debug(`Найден RateLimit (4): ${foundRateLimit._source}`);
       return foundRateLimit;
   }

   // 5. Проверка лимитов, определенных непосредственно в инструменте
   if (toolSecurity?.rateLimit) {
     foundRateLimit = { ...toolSecurity.rateLimit, _source: `tool '${toolName}' metadata` };
     this.logger.debug(`Найден RateLimit (5): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   // Если ни один лимит не найден
   this.logger.debug(`RateLimit для инструмента '${toolName}' и пользователя '${userInfo.userId}' не найден.`);
   return undefined;
 }

  /**
   * Логирует событие вызова инструмента и эмитит его через EventEmitter.
   * @param event - Расширенное событие вызова инструмента.
   */
  logToolCall(event: ExtendedToolCallEvent): void {
    // Логируем базовую информацию
    this.logger.log(`Инструмент вызван: ${event.toolName}`, {
      userId: event.userId,
      success: event.success,
      durationMs: event.duration,
      // Логируем только ключи аргументов для краткости/безопасности
      argsKeys: event.args ? Object.keys(event.args) : [],
      ...(event.error && { error: event.error.message }) // Добавляем сообщение об ошибке, если была
    });

    // Логируем подробности в режиме отладки
    if (this.debug) {
         this.logger.debug(`Детали вызова инструмента ${event.toolName}:`, {
             timestamp: new Date(event.timestamp).toISOString(),
             fullArgs: event.args, // Полные аргументы в debug режиме
             fullResult: event.result, // Полный результат в debug режиме
             fullError: event.error, // Полная ошибка в debug режиме
         });
    }

    // Эмитим событие для внешних подписчиков
    this.eventEmitter.emit('tool:call', event);
  }

  /**
   * Проверяет, включен ли режим отладки.
   * @returns {boolean}
   */
  isDebugEnabled(): boolean {
    return this.debug;
  }

  /**
   * Устанавливает режим отладки для SecurityManager и всех его подкомпонентов.
   * @param debug - `true` для включения, `false` для выключения.
   */
  setDebugMode(debug: boolean): void {
    this.debug = debug;
    this.logger.setDebug(debug);
    // Передаем флаг во все подкомпоненты
    this.authManager?.setDebugMode(debug);
    this.rateLimitManager?.setDebugMode(debug);
    this.accessControlManager?.setDebugMode(debug);
    this.argumentSanitizer?.setDebugMode(debug);
    this.logger.log(`Режим отладки SecurityManager ${debug ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}.`);
  }

  /**
   * Очищает кэш токенов в AuthManager.
   */
  clearTokenCache(): void {
    this.authManager.clearTokenCache();
    this.logger.log(`Кэш токенов аутентификации очищен.`);
  }

  /**
   * Сбрасывает счетчики ограничения запросов в RateLimitManager.
   * @param userId - ID пользователя (опционально). Если не указан, сбрасываются все счетчики.
   */
  clearRateLimitCounters(userId?: string): void {
    this.rateLimitManager.clearLimits(userId);
    if (userId) {
       this.logger.log(`Счетчики Rate Limit очищены для пользователя ${userId}.`);
   } else {
       this.logger.log(`Все счетчики Rate Limit очищены.`);
   }
  }

  /**
   * Подписывается на события безопасности, генерируемые SecurityManager.
   * Список событий:
   * - `config:updated`: Конфигурация обновлена. payload: { config: SecurityConfig }
   * - `user:authenticated`: Пользователь успешно аутентифицирован. payload: { userInfo: UserAuthInfo }
   * - `auth:error`: Ошибка во время аутентификации. payload: { message: string, error: Error }
   * - `token:created`: JWT токен создан. payload: { userId: string, expiresAt?: number }
   * - `token:invalid`: JWT токен не прошел валидацию. payload: { token: string, error: Error }
   * - `cache:cleared`: Кэш токенов очищен. payload: { type: 'token' }
   * - `access:granted`: Доступ к инструменту разрешен. payload: { userId?: string, toolName: string }
   * - `access:denied`: Доступ к инструменту запрещен. payload: { userId?: string, toolName: string, reason: string }
   * - `ratelimit:new`: Создан новый лимит для пользователя/инструмента. payload: { userId, toolName, source, limit, resetTime }
   * - `ratelimit:exceeded`: Превышен лимит запросов. payload: { userId, toolName, source, currentCount, limit, resetTime }
   * - `ratelimit:cleared`: Счетчики лимитов сброшены. payload: { userId?: string, all?: boolean }
   * - `ratelimit:expired`: Удалены просроченные лимиты при очистке. payload: { count: number }
   * - `security:dangerous_args`: Обнаружены опасные аргументы. payload: { toolName, userId?, violations, args }
   * - `security:pattern_error`: Ошибка компиляции RegExp паттерна. payload: { toolName?, pattern, error }
   * - `tool:call`: Зарегистрирован вызов инструмента. payload: ExtendedToolCallEvent
   * - `security:error`: Общая ошибка безопасности при проверке. payload: { toolName, userId?, error: OpenRouterError }
   *
   * @param event - Имя события.
   * @param handler - Функция-обработчик события.
   * @returns {this} Экземпляр SecurityManager для цепочки вызовов.
   */
  on(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.on(event, handler);
    this.logger.debug(`Добавлен внешний обработчик для события безопасности: ${event}`);
    return this;
  }

  /**
   * Отписывается от событий безопасности.
   * @param event - Имя события.
   * @param handler - Функция-обработчик, которую нужно удалить.
   * @returns {this} Экземпляр SecurityManager для цепочки вызовов.
   */
  off(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.off(event, handler);
    this.logger.debug(`Удален внешний обработчик для события безопасности: ${event}`);
    return this;
  }

 /**
  * Освобождает ресурсы, используемые SecurityManager и его подкомпонентами
  * (останавливает таймеры, очищает кэши и т.д.).
  */
  destroy(): void {
     this.logger.log("Уничтожение SecurityManager и его подкомпонентов...");
     // Вызываем destroy у всех подкомпонентов, проверяя их наличие
     this.rateLimitManager?.destroy?.();
     this.argumentSanitizer?.destroy?.();
     this.accessControlManager?.destroy?.();
     this.authManager?.destroy?.();
     // Очищаем всех внешних подписчиков
     if (this.eventEmitter instanceof SecurityEventEmitter) {
         (this.eventEmitter as SecurityEventEmitter).removeAllListeners?.();
     }
     this.logger.log("SecurityManager уничтожен.");
 }
}