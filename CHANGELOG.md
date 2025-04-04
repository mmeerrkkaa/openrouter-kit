# Changelog

### Major Refactoring: Pluggable History Storage

- **Removed legacy `HistoryManager` implementation.**
- Introduced a new **adapter-based architecture** for chat history storage.
- Added `IHistoryStorage` interface for pluggable storage backends.
- Implemented built-in adapters:
  - `MemoryHistoryStorage` (in-memory)
  - `DiskHistoryStorage` (JSON files on disk)
- Created `UnifiedHistoryManager` that works with any `IHistoryStorage` adapter.
- `OpenRouterClient` now uses `UnifiedHistoryManager` exclusively.
- **Removed** `historyStorage` and related options from config.
- **Added** new config option: `historyAdapter?: IHistoryStorage` to inject any custom storage backend (e.g., Redis, MongoDB, API).
- Updated all internal calls to use the new manager.
- Updated README to reflect the new architecture.

### Other Improvements

- Cleaned up `OpenRouterClient` constructor, removed legacy code.
- Improved comments and code clarity.
- Updated Russian documentation (`README.ru.md`) to describe the new plugin-based history system.
- Prepared the codebase for future plugin system and middleware improvements.