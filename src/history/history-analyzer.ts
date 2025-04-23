// Path: src/history/history-analyzer.ts
import { UnifiedHistoryManager } from './unified-history-manager';
import { HistoryEntry, UsageInfo, Role } from '../types';
import { Logger } from '../utils/logger';
import { mapError } from '../utils/error';

// --- Типы для опций и результатов анализа ---

/** Опции для фильтрации истории перед анализом */
export interface HistoryQueryOptions {
    startDate?: Date | number; // Начальная дата (или timestamp)
    endDate?: Date | number;   // Конечная дата (или timestamp)
    models?: string[];        // Фильтр по моделям
    roles?: Role[];           // Фильтр по ролям сообщений (менее полезно для статистики API)
    minCost?: number;         // Фильтр по минимальной стоимости вызова API
    finishReasons?: string[]; // Фильтр по причинам завершения
}

/** Агрегированная статистика по истории */
export interface HistoryStats {
    totalApiCalls: number;
    totalCost: number;
    totalUsage: UsageInfo;
    usageByModel: Record<string, UsageInfo>;
    costByModel: Record<string, number>;
    finishReasonCounts: Record<string, number>;
    firstEntryTimestamp: number | null;
    lastEntryTimestamp: number | null;
    entriesAnalyzed: number;
    entriesTotal: number; // Общее количество записей до фильтрации
}

/** Данные для временных рядов */
export interface TimeSeriesDataPoint {
    timestamp: number; // Начало интервала
    value: number;     // Значение за интервал (e.g., cost, tokens)
}

export type TimeSeriesData = TimeSeriesDataPoint[];

export class HistoryAnalyzer {
    private historyManager: UnifiedHistoryManager;
    private logger: Logger;

    constructor(historyManager: UnifiedHistoryManager, logger: Logger) {
        this.historyManager = historyManager;
        this.logger = logger.withPrefix('HistoryAnalyzer');
        this.logger.log('HistoryAnalyzer initialized.');
    }

    /**
     * Фильтрует записи истории на основе предоставленных опций.
     */
    private filterEntries(entries: HistoryEntry[], options?: HistoryQueryOptions): HistoryEntry[] {
        if (!options) return entries;

        const { startDate, endDate, models, roles, minCost, finishReasons } = options;
        const startTs = startDate instanceof Date ? startDate.getTime() : (typeof startDate === 'number' ? startDate : null);
        const endTs = endDate instanceof Date ? endDate.getTime() : (typeof endDate === 'number' ? endDate : null);

        return entries.filter(entry => {
            const meta = entry.apiCallMetadata;
            const msgTimestamp = entry.message.timestamp ? new Date(entry.message.timestamp).getTime() : null;
            const apiTimestamp = meta?.timestamp; // Timestamp ответа API

            // Используем timestamp ответа API для фильтрации по дате, если он есть, иначе timestamp сообщения
            const entryTimestamp = apiTimestamp ?? msgTimestamp;

            if (startTs && (!entryTimestamp || entryTimestamp < startTs)) return false;
            if (endTs && (!entryTimestamp || entryTimestamp > endTs)) return false;
            if (models && (!meta || !models.includes(meta.modelUsed))) return false;
            if (roles && !roles.includes(entry.message.role)) return false; // Фильтр по роли сообщения
            // Фильтры ниже применяются только к записям с метаданными API
            if (meta) {
                 if (minCost !== undefined && (meta.cost === null || meta.cost < minCost)) return false;
                 if (finishReasons && (!meta.finishReason || !finishReasons.includes(meta.finishReason))) return false;
            } else {
                 // Если фильтр требует метаданные, а их нет, исключаем запись
                 if (minCost !== undefined || finishReasons) return false;
            }

            return true;
        });
    }

    /**
     * Рассчитывает агрегированную статистику для указанного ключа истории.
     */
    public async getStats(key: string, options?: HistoryQueryOptions): Promise<HistoryStats> {
        this.logger.debug(`Calculating stats for history key '${key}'...`, { options });
        let allEntries: HistoryEntry[] = [];
        try {
            allEntries = await this.historyManager.getHistoryEntries(key);
        } catch (error) {
             this.logger.error(`Failed to load history entries for key '${key}'`, mapError(error));
             throw mapError(error); // Перебрасываем ошибку
        }

        const filteredEntries = this.filterEntries(allEntries, options);
        const entriesAnalyzed = filteredEntries.length;
        this.logger.debug(`Analyzing ${entriesAnalyzed} entries out of ${allEntries.length} total.`);

        const stats: HistoryStats = {
            totalApiCalls: 0,
            totalCost: 0,
            totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            usageByModel: {},
            costByModel: {},
            finishReasonCounts: {},
            firstEntryTimestamp: null,
            lastEntryTimestamp: null,
            entriesAnalyzed: entriesAnalyzed,
            entriesTotal: allEntries.length,
        };

        let firstTs: number | null = null;
        let lastTs: number | null = null;

        for (const entry of filteredEntries) {
            const meta = entry.apiCallMetadata;
            const entryTimestamp = meta?.timestamp ?? (entry.message.timestamp ? new Date(entry.message.timestamp).getTime() : null);

            if (entryTimestamp) {
                 if (firstTs === null || entryTimestamp < firstTs) {
                     firstTs = entryTimestamp;
                 }
                 if (lastTs === null || entryTimestamp > lastTs) {
                     lastTs = entryTimestamp;
                 }
            }

            // Статистика собирается только по записям с метаданными API
            if (meta) {
                stats.totalApiCalls += 1;
                stats.totalCost += meta.cost ?? 0;

                if (meta.usage) {
                    stats.totalUsage.prompt_tokens += meta.usage.prompt_tokens ?? 0;
                    stats.totalUsage.completion_tokens += meta.usage.completion_tokens ?? 0;
                    stats.totalUsage.total_tokens += meta.usage.total_tokens ?? 0;

                    // Статистика по моделям
                    if (!stats.usageByModel[meta.modelUsed]) {
                        stats.usageByModel[meta.modelUsed] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                    }
                    if (!stats.costByModel[meta.modelUsed]) {
                        stats.costByModel[meta.modelUsed] = 0;
                    }

                    stats.usageByModel[meta.modelUsed].prompt_tokens += meta.usage.prompt_tokens ?? 0;
                    stats.usageByModel[meta.modelUsed].completion_tokens += meta.usage.completion_tokens ?? 0;
                    stats.usageByModel[meta.modelUsed].total_tokens += meta.usage.total_tokens ?? 0;
                    stats.costByModel[meta.modelUsed] += meta.cost ?? 0;
                }

                // Статистика по finish_reason
                const reason = meta.finishReason ?? 'unknown';
                stats.finishReasonCounts[reason] = (stats.finishReasonCounts[reason] || 0) + 1;
            }
        }

        stats.firstEntryTimestamp = firstTs;
        stats.lastEntryTimestamp = lastTs;

        // Округление общей стоимости
        stats.totalCost = parseFloat(stats.totalCost.toFixed(8));
        for(const model in stats.costByModel) {
            stats.costByModel[model] = parseFloat(stats.costByModel[model].toFixed(8));
        }


        this.logger.log(`Stats calculated for key '${key}'. Analyzed ${entriesAnalyzed} entries.`);
        this.logger.debug("Calculated Stats:", stats);
        return stats;
    }

    /**
     * Группирует стоимость по временным интервалам (например, по дням).
     * @param key - Ключ истории.
     * @param interval - Интервал группировки ('day', 'hour', 'minute'). По умолчанию 'day'.
     * @param options - Опции фильтрации.
     */
    public async getCostOverTime(
        key: string,
        interval: 'day' | 'hour' | 'minute' = 'day',
        options?: HistoryQueryOptions
    ): Promise<TimeSeriesData> {
        this.logger.debug(`Calculating cost over time for key '${key}', interval: ${interval}...`, { options });
        let allEntries: HistoryEntry[] = [];
         try {
             allEntries = await this.historyManager.getHistoryEntries(key);
         } catch (error) {
              this.logger.error(`Failed to load history entries for key '${key}'`, mapError(error));
              throw mapError(error);
         }

        const filteredEntries = this.filterEntries(allEntries, options);
        const costByInterval: Record<number, number> = {};

        for (const entry of filteredEntries) {
            const meta = entry.apiCallMetadata;
            if (meta && meta.cost !== null && meta.timestamp) {
                const timestamp = meta.timestamp;
                let intervalStartTs: number;

                const date = new Date(timestamp);
                if (interval === 'day') {
                    date.setUTCHours(0, 0, 0, 0);
                    intervalStartTs = date.getTime();
                } else if (interval === 'hour') {
                    date.setUTCMinutes(0, 0, 0);
                    intervalStartTs = date.getTime();
                } else { // minute
                    date.setUTCSeconds(0, 0);
                    intervalStartTs = date.getTime();
                }

                costByInterval[intervalStartTs] = (costByInterval[intervalStartTs] || 0) + meta.cost;
            }
        }

        const timeSeries: TimeSeriesData = Object.entries(costByInterval)
            .map(([ts, value]) => ({
                timestamp: parseInt(ts, 10),
                value: parseFloat(value.toFixed(8)) // Округление
            }))
            .sort((a, b) => a.timestamp - b.timestamp); // Сортировка по времени

        this.logger.log(`Cost over time calculated for key '${key}'. Found ${timeSeries.length} data points.`);
        return timeSeries;
    }

    /**
     * Возвращает суммарное использование токенов, сгруппированное по моделям.
     */
    public async getTokenUsageByModel(key: string, options?: HistoryQueryOptions): Promise<Record<string, UsageInfo>> {
        this.logger.debug(`Calculating token usage by model for key '${key}'...`, { options });
        let allEntries: HistoryEntry[] = [];
         try {
             allEntries = await this.historyManager.getHistoryEntries(key);
         } catch (error) {
              this.logger.error(`Failed to load history entries for key '${key}'`, mapError(error));
              throw mapError(error);
         }

        const filteredEntries = this.filterEntries(allEntries, options);
        const usageByModel: Record<string, UsageInfo> = {};

        for (const entry of filteredEntries) {
            const meta = entry.apiCallMetadata;
            if (meta?.usage) {
                const model = meta.modelUsed;
                if (!usageByModel[model]) {
                    usageByModel[model] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                }
                usageByModel[model].prompt_tokens += meta.usage.prompt_tokens ?? 0;
                usageByModel[model].completion_tokens += meta.usage.completion_tokens ?? 0;
                usageByModel[model].total_tokens += meta.usage.total_tokens ?? 0;
            }
        }
        this.logger.log(`Token usage by model calculated for key '${key}'. Found usage for ${Object.keys(usageByModel).length} models.`);
        return usageByModel;
    }

    // TODO: Добавить метод exportHistory
}