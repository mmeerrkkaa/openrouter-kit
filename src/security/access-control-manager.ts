// Path: src/security/access-control-manager.ts
import {
    IAccessControlManager,
    SecurityCheckParams,
    SecurityContext,
    ExtendedUserAuthInfo as UserAuthInfo, // Use renamed type locally
    ExtendedSecurityConfig as SecurityConfig // Use renamed type locally
} from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { AccessDeniedError } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

export class AccessControlManager implements IAccessControlManager {
  private eventEmitter: SimpleEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(eventEmitter: SimpleEventEmitter, logger: Logger) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    if (typeof (this.logger as any).setDebug === 'function') {
        (this.logger as any).setDebug(debug);
    }
  }

  async checkAccess(params: SecurityCheckParams): Promise<boolean> {
    const { tool, userInfo, context } = params;
    const toolName = context.toolName || tool.function?.name || tool.name || 'unknown_tool';
    const userId = userInfo?.userId || 'anonymous';

    this.logger.debug(`Checking access to tool '${toolName}' for user '${userId}'...`);

    // Ensure context uses the extended SecurityConfig type
    const securityContext: SecurityContext = {
        config: context?.config || { defaultPolicy: 'deny-all', debug: this.debugMode },
        debug: context?.debug ?? this.debugMode,
        userId: context?.userId ?? userInfo?.userId,
        toolName: context?.toolName ?? toolName,
    };

    const denialReason = await this.getAccessDenialReason(tool, userInfo, securityContext);

    if (denialReason) {
      this.logger.warn(`Access DENIED for tool '${toolName}' (User: ${userId}). Reason: ${denialReason}`);
      this.eventEmitter.emit('access:denied', { userId: userInfo?.userId, toolName: toolName, reason: denialReason });
      throw new AccessDeniedError(`Access to tool '${toolName}' denied: ${denialReason}`);
    } else {
       this.logger.debug(`Access GRANTED for tool '${toolName}' (User: ${userId}).`);
       this.eventEmitter.emit('access:granted', { userId: userInfo?.userId, toolName: toolName });
       return true;
    }
  }

  // Accept extended UserAuthInfo and SecurityConfig types
  private async getAccessDenialReason(
      tool: Tool,
      userInfo: UserAuthInfo | null, // Now ExtendedUserAuthInfo
      context: SecurityContext // Context now contains ExtendedSecurityConfig
  ): Promise<string | null> {
    const toolName = context.toolName!;
    const config = context.config; // This is now ExtendedSecurityConfig
    const toolSecurity = tool.security;

    // --- 1. Check Tool-Specific Requirements ---
    if (toolSecurity?.requiredRole) {
       if (!userInfo) return `Authentication required (tool requires role).`;
       const requiredRoles = Array.isArray(toolSecurity.requiredRole) ? toolSecurity.requiredRole : [toolSecurity.requiredRole];
       const userRoles = [userInfo.role, ...(userInfo.roles || [])].filter(Boolean) as string[];
       const hasRequiredRole = requiredRoles.some((reqRole: string) => userRoles.includes(reqRole));
       if (!hasRequiredRole) {
           return `Tool requires one of the following roles: ${requiredRoles.join(', ')}. User has: ${userRoles.join(', ') || 'none'}.`;
       }
    }
    if (toolSecurity?.requiredScopes) {
        if (!userInfo) return `Authentication required (tool requires permissions/scopes).`;
        const requiredScopes = Array.isArray(toolSecurity.requiredScopes) ? toolSecurity.requiredScopes : [toolSecurity.requiredScopes];
        const userScopes = [...(userInfo.scopes || []), ...(userInfo.permissions || [])].filter(Boolean) as string[];
        const hasAllRequiredScopes = requiredScopes.every((reqScope: string) => userScopes.includes(reqScope));
        if (!hasAllRequiredScopes) {
            const missingScopes = requiredScopes.filter((rs: string) => !userScopes.includes(rs));
            return `Tool requires permissions/scopes: ${requiredScopes.join(', ')}. User is missing: ${missingScopes.join(', ')}.`;
        }
    }

    // --- 2. Check Configuration-Based Rules ---
    const toolAccessConfig = config.toolAccess?.[toolName];
    const globalToolAccessConfig = config.toolAccess?.['*'];
    const userRole = userInfo?.role;
    const roleSpecificConfig = userRole ? config.roles?.roles?.[userRole] : undefined;

    const isAllowedBy = (accessConfig: typeof toolAccessConfig | undefined): boolean => {
        if (!accessConfig) return false;
        if (accessConfig.allow === false) return false;
        if (accessConfig.allow === true) return true;

        if (userInfo?.role && accessConfig.roles) {
            const allowedRoles = Array.isArray(accessConfig.roles) ? accessConfig.roles : [accessConfig.roles];
            if (allowedRoles.includes(userInfo.role)) return true;
        }
        if (userInfo?.apiKey && accessConfig.allowedApiKeys) {
            if (accessConfig.allowedApiKeys.includes(userInfo.apiKey) || accessConfig.allowedApiKeys.includes('*')) return true;
        }
         if (userInfo?.scopes && accessConfig.scopes) {
             const requiredScopes = Array.isArray(accessConfig.scopes) ? accessConfig.scopes : [accessConfig.scopes];
              const userScopes = [...(userInfo.scopes || []), ...(userInfo.permissions || [])].filter(Boolean) as string[];
             if (requiredScopes.every((reqScope: string) => userScopes.includes(reqScope))) return true;
         }

        return false;
    };

    const allowedByToolSpecific = isAllowedBy(toolAccessConfig);
    const allowedByGlobal = isAllowedBy(globalToolAccessConfig) && toolAccessConfig?.allow !== false;

    let allowedByRole = false;
    if (roleSpecificConfig) {
        const allowedTools = roleSpecificConfig.allowedTools;
        if (allowedTools === '*' || (Array.isArray(allowedTools) && allowedTools.includes(toolName))) {
            allowedByRole = true;
        }
    }

    // --- 3. Apply Default Policy ---
    if (config.defaultPolicy === 'deny-all') {
        if (!allowedByToolSpecific && !allowedByGlobal && !allowedByRole) {
            let reason = `Access denied by 'deny-all' policy. No matching allow rule found`;
            if (userInfo) {
                reason += ` for user '${userInfo.userId}' (Role: ${userInfo.role || 'none'})`;
            }
            if (toolAccessConfig) reason += ` (Tool-specific config exists).`;
            if (globalToolAccessConfig) reason += ` (Global tool config exists).`;
            if (roleSpecificConfig) reason += ` (Role config for '${userInfo?.role}' exists).`;
            return reason + '.';
        }
    } else if (config.defaultPolicy === 'allow-all') {
        if (toolAccessConfig?.allow === false) {
            return `Access explicitly denied by toolAccess configuration for '${toolName}'.`;
        }
    }

    return null; // Access allowed
  }

  destroy(): void {
      this.logger.log("AccessControlManager destroyed.");
  }
}