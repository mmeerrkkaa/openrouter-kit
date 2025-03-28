// Path: security/access-control-manager.ts
import { IAccessControlManager, SecurityCheckParams, SecurityContext, UserAuthInfo } from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { AccessDeniedError } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

export class AccessControlManager implements IAccessControlManager {
  private eventEmitter: SimpleEventEmitter; // Use SimpleEventEmitter type
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(eventEmitter: SimpleEventEmitter, logger: Logger) { // Use SimpleEventEmitter type
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  async checkAccess(params: SecurityCheckParams): Promise<boolean> {
    const { tool, userInfo, context } = params;
    const toolName = tool.function?.name || tool.name || 'unknown_tool';
    const userId = userInfo?.userId || 'anonymous';

    this.logger.debug(`Checking access to '${toolName}' for user '${userId}'`);

    const securityContext: SecurityContext = context || {
      config: { defaultPolicy: 'deny-all' },
      debug: this.debugMode
    };
    if (!context) {
        securityContext.toolName = toolName;
        securityContext.userId = userInfo?.userId;
    }

    const reason = await this.getAccessDenialReason(tool, userInfo, securityContext);

    if (reason) {
      this.logger.warn(`Access to '${toolName}' for user '${userId}' denied. Reason: ${reason}`);
      this.eventEmitter.emit('access:denied', { userId: userInfo?.userId, toolName: toolName, reason: reason });
      throw new AccessDeniedError(`Access to tool ${toolName} denied: ${reason}`);
    } else {
       this.logger.debug(`Access to '${toolName}' for user '${userId}' granted.`);
      this.eventEmitter.emit('access:granted', { userId: userInfo?.userId, toolName: toolName });
      return true;
    }
  }

  private async getAccessDenialReason(tool: Tool, userInfo: UserAuthInfo | null, context: SecurityContext): Promise<string | null> {
    const toolName = tool.function?.name || tool.name;
    const config = context.config;

    if (!toolName) return 'Could not determine tool name.';

    if (config.defaultPolicy === 'deny-all') {
       const toolAccessConfig = config.toolAccess?.[toolName];
       const globalToolAccessConfig = config.toolAccess?.['*'];
       let isAllowedByToolAccess = toolAccessConfig?.allow === true;
       let isAllowedGlobally = globalToolAccessConfig?.allow === true && toolAccessConfig?.allow !== false;

       if (userInfo?.role && toolAccessConfig?.roles) {
           const allowedRoles = Array.isArray(toolAccessConfig.roles) ? toolAccessConfig.roles : [toolAccessConfig.roles];
           if (allowedRoles.includes(userInfo.role)) isAllowedByToolAccess = true;
       }
       if (userInfo?.role && globalToolAccessConfig?.roles) {
            const allowedRoles = Array.isArray(globalToolAccessConfig.roles) ? globalToolAccessConfig.roles : [globalToolAccessConfig.roles];
            if (allowedRoles.includes(userInfo.role) && toolAccessConfig?.allow !== false) isAllowedGlobally = true;
        }
       if (userInfo?.apiKey && toolAccessConfig?.allowedApiKeys) {
           if (toolAccessConfig.allowedApiKeys.includes(userInfo.apiKey) || toolAccessConfig.allowedApiKeys.includes('*')) isAllowedByToolAccess = true;
       }
        if (userInfo?.apiKey && globalToolAccessConfig?.allowedApiKeys) {
            if ((globalToolAccessConfig.allowedApiKeys.includes(userInfo.apiKey) || globalToolAccessConfig.allowedApiKeys.includes('*')) && toolAccessConfig?.allow !== false) isAllowedGlobally = true;
        }

       if (!isAllowedByToolAccess && !isAllowedGlobally) {
           if (userInfo?.role && config.roles?.roles?.[userInfo.role]) {
               const roleConfig = config.roles.roles[userInfo.role];
               const allowedTools = Array.isArray(roleConfig.allowedTools) ? roleConfig.allowedTools : (typeof roleConfig.allowedTools === 'string' ? [roleConfig.allowedTools] : []);
               if (!allowedTools.includes('*') && !allowedTools.includes(toolName)) {
                   return `Tool not allowed for role '${userInfo.role}' in config.roles.`;
               }
           } else {
               // If default policy is deny-all and no specific rule allows access, deny unless overridden by tool-specific requirements handled below.
               // Need to check tool-specific requirements before definitively denying.
               // Consider the case where a tool requires a specific scope, which the user might have even if not explicitly allowed by role or toolAccess.
               // Let's defer the denial until after checking tool-specific security rules.
           }
       }
    }

    const toolSecurity = tool.security || tool.function?.security;
    if (toolSecurity?.requiredRole) {
       if (!userInfo) return `Authentication required (role).`;
       const requiredRoles = Array.isArray(toolSecurity.requiredRole) ? toolSecurity.requiredRole : [toolSecurity.requiredRole];
       const userRoles = [userInfo.role, ...(userInfo.roles || [])].filter(Boolean) as string[];
       const hasRequiredRole = requiredRoles.some(reqRole => userRoles.includes(reqRole));
       if (!hasRequiredRole) {
           return `One of the following roles required: ${requiredRoles.join(', ')}.`;
       }
    }
    if (toolSecurity?.requiredScopes) {
        if (!userInfo) return `Authentication required (permissions).`;
        const requiredScopes = Array.isArray(toolSecurity.requiredScopes) ? toolSecurity.requiredScopes : [toolSecurity.requiredScopes];
        const userScopes = [...(userInfo.scopes || []), ...(userInfo.permissions || [])];
        const hasRequiredScope = requiredScopes.every(reqScope => userScopes.includes(reqScope));
        if (!hasRequiredScope) {
            return `Required permissions: ${requiredScopes.join(', ')}.`;
        }
    }

    // Final check for deny-all after evaluating tool-specific requirements
    if (config.defaultPolicy === 'deny-all') {
        const toolAccessConfig = config.toolAccess?.[toolName];
        const globalToolAccessConfig = config.toolAccess?.['*'];
        let isAllowedByToolAccess = toolAccessConfig?.allow === true;
        let isAllowedGlobally = globalToolAccessConfig?.allow === true && toolAccessConfig?.allow !== false;
        let isAllowedByRole = false;

        if (userInfo?.role && toolAccessConfig?.roles) {
            const allowedRoles = Array.isArray(toolAccessConfig.roles) ? toolAccessConfig.roles : [toolAccessConfig.roles];
            if (allowedRoles.includes(userInfo.role)) isAllowedByToolAccess = true;
        }
        if (userInfo?.role && globalToolAccessConfig?.roles) {
             const allowedRoles = Array.isArray(globalToolAccessConfig.roles) ? globalToolAccessConfig.roles : [globalToolAccessConfig.roles];
             if (allowedRoles.includes(userInfo.role) && toolAccessConfig?.allow !== false) isAllowedGlobally = true;
         }
        if (userInfo?.apiKey && toolAccessConfig?.allowedApiKeys) {
            if (toolAccessConfig.allowedApiKeys.includes(userInfo.apiKey) || toolAccessConfig.allowedApiKeys.includes('*')) isAllowedByToolAccess = true;
        }
         if (userInfo?.apiKey && globalToolAccessConfig?.allowedApiKeys) {
             if ((globalToolAccessConfig.allowedApiKeys.includes(userInfo.apiKey) || globalToolAccessConfig.allowedApiKeys.includes('*')) && toolAccessConfig?.allow !== false) isAllowedGlobally = true;
         }

         if (userInfo?.role && config.roles?.roles?.[userInfo.role]) {
             const roleConfig = config.roles.roles[userInfo.role];
             const allowedTools = Array.isArray(roleConfig.allowedTools) ? roleConfig.allowedTools : (typeof roleConfig.allowedTools === 'string' ? [roleConfig.allowedTools] : []);
             if (allowedTools.includes('*') || allowedTools.includes(toolName)) {
                isAllowedByRole = true;
             }
         }

        // Deny if not explicitly allowed by toolAccess, globalAccess, or role config
        if (!isAllowedByToolAccess && !isAllowedGlobally && !isAllowedByRole) {
            return `Access denied by 'deny-all' default policy and no specific allow rule matched.`;
        }
    }


    return null;
  }

  destroy(): void {
      this.logger.log("AccessControlManager destroyed.");
  }
}