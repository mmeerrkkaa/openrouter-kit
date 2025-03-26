// Path: security/access-control-manager.ts
import { IAccessControlManager, SecurityCheckParams, SecurityContext, UserAuthInfo, ISecurityEventEmitter } from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { AccessDeniedError } from '../utils/error';

export class AccessControlManager implements IAccessControlManager {
  private eventEmitter: ISecurityEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(eventEmitter: ISecurityEventEmitter, logger: Logger) {
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

  /** @private */
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
                // If there's no explicit permission in toolAccess or roles, we deny access
                // But only if the user doesn't have special permissions (checked below)
                // For now, just remember that access is not allowed by configuration
                // return `Access denied by 'deny-all' and tool not explicitly allowed.`;
           }
       }
    }

    const toolSecurity = tool.security || tool.function?.security;
    if (toolSecurity?.requiredRole) {
       if (!userInfo) return `Authentication required (role).`;
       const requiredRoles = Array.isArray(toolSecurity.requiredRole) ? toolSecurity.requiredRole : [toolSecurity.requiredRole];
       const hasRequiredBaseRole = userInfo.role && requiredRoles.includes(userInfo.role);
       const hasRequiredExtendedRole = userInfo.roles && requiredRoles.some(reqRole => userInfo.roles!.includes(reqRole));
       if (!hasRequiredBaseRole && !hasRequiredExtendedRole) {
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

    // If no denial reason found after all checks, access is granted
    return null;
  }

  destroy(): void {
      this.logger.log("AccessControlManager destroyed.");
  }
}