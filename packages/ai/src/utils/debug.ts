// Real-time Debugging and Performance Monitoring System

export interface DebugLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  duration?: number;
  metadata?: any;
  error?: string;
}

export interface PerformanceMetrics {
  operationCounts: Record<string, number>;
  averageDurations: Record<string, number>;
  errorRates: Record<string, number>;
  modelUsage: Record<string, number>;
  cacheHitRate: number;
}

class DebugSystem {
  private logs: DebugLog[] = [];
  private maxLogs = 1000;
  private metrics: PerformanceMetrics = {
    operationCounts: {},
    averageDurations: {},
    errorRates: {},
    modelUsage: {},
    cacheHitRate: 0
  };
  private timers: Map<string, number> = new Map();

  log(level: DebugLog['level'], component: string, operation: string, metadata?: any, error?: string) {
    const log: DebugLog = {
      timestamp: Date.now(),
      level,
      component,
      operation,
      metadata,
      error
    };

    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Update metrics
    const key = `${component}.${operation}`;
    this.metrics.operationCounts[key] = (this.metrics.operationCounts[key] || 0) + 1;
    
    if (error) {
      this.metrics.errorRates[key] = (this.metrics.errorRates[key] || 0) + 1;
    }

    // Console output for immediate debugging
    if (process.env.DEBUG_MODE === 'true') {
      const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'info' ? 'ℹ️' : '🔍';
      console.log(`${emoji} [${component}] ${operation}`, metadata || '');
      if (error) console.error('Error:', error);
    }
  }

  startTimer(operationId: string) {
    this.timers.set(operationId, Date.now());
  }

  endTimer(operationId: string, component: string, operation: string, metadata?: any) {
    const startTime = this.timers.get(operationId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(operationId);
      
      // Update metrics
      const key = `${component}.${operation}`;
      const currentAvg = this.metrics.averageDurations[key] || 0;
      const count = this.metrics.operationCounts[key] || 1;
      this.metrics.averageDurations[key] = (currentAvg * (count - 1) + duration) / count;

      this.log('debug', component, operation, { ...metadata, duration_ms: duration });
      return duration;
    }
    return 0;
  }

  recordModelUsage(model: string) {
    this.metrics.modelUsage[model] = (this.metrics.modelUsage[model] || 0) + 1;
  }

  getRecentLogs(count = 50): DebugLog[] {
    return this.logs.slice(-count);
  }

  getLogsByComponent(component: string, count = 50): DebugLog[] {
    return this.logs
      .filter(log => log.component === component)
      .slice(-count);
  }

  getErrorLogs(count = 20): DebugLog[] {
    return this.logs
      .filter(log => log.level === 'error')
      .slice(-count);
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getSystemStatus(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check error rates
    Object.entries(this.metrics.errorRates).forEach(([operation, errors]) => {
      const total = this.metrics.operationCounts[operation] || 1;
      const errorRate = errors / total;
      if (errorRate > 0.1) { // 10% error rate threshold
        issues.push(`High error rate for ${operation}: ${(errorRate * 100).toFixed(1)}%`);
      }
    });

    // Check average durations
    Object.entries(this.metrics.averageDurations).forEach(([operation, avgDuration]) => {
      if (avgDuration > 10000) { // 10 second threshold
        issues.push(`Slow operation ${operation}: ${(avgDuration / 1000).toFixed(1)}s avg`);
      }
    });

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  formatDebugReport(): string {
    const recent = this.getRecentLogs(10);
    const errors = this.getErrorLogs(5);
    const status = this.getSystemStatus();
    
    let report = `🔍 **Debug Report**\n\n`;
    
    // System Status
    report += `**System Status:** ${status.healthy ? '🟢 Healthy' : '🔴 Issues Detected'}\n`;
    if (status.issues.length > 0) {
      report += `**Issues:**\n${status.issues.map(issue => `• ${issue}`).join('\n')}\n\n`;
    }
    
    // Performance Metrics
    report += `**Performance:**\n`;
    Object.entries(this.metrics.averageDurations).slice(0, 5).forEach(([op, duration]) => {
      report += `• ${op}: ${(duration / 1000).toFixed(2)}s avg\n`;
    });
    
    // Model Usage
    report += `\n**Model Usage:**\n`;
    Object.entries(this.metrics.modelUsage).forEach(([model, count]) => {
      report += `• ${model}: ${count} calls\n`;
    });
    
    // Recent Errors
    if (errors.length > 0) {
      report += `\n**Recent Errors:**\n`;
      errors.forEach(error => {
        report += `• ${error.component}.${error.operation}: ${error.error}\n`;
      });
    }
    
    return report;
  }

  clear() {
    this.logs = [];
    this.metrics = {
      operationCounts: {},
      averageDurations: {},
      errorRates: {},
      modelUsage: {},
      cacheHitRate: 0
    };
    this.timers.clear();
  }
}

// Global debug instance
export const debugSystem = new DebugSystem();

// Convenience functions
export function debugLog(component: string, operation: string, metadata?: any) {
  debugSystem.log('debug', component, operation, metadata);
}

export function infoLog(component: string, operation: string, metadata?: any) {
  debugSystem.log('info', component, operation, metadata);
}

export function warnLog(component: string, operation: string, metadata?: any) {
  debugSystem.log('warn', component, operation, metadata);
}

export function errorLog(component: string, operation: string, error: string, metadata?: any) {
  debugSystem.log('error', component, operation, metadata, error);
}

export function timeOperation<T>(
  operationId: string,
  component: string, 
  operation: string,
  fn: () => Promise<T>,
  metadata?: any
): Promise<T> {
  debugSystem.startTimer(operationId);
  return fn()
    .then(result => {
      debugSystem.endTimer(operationId, component, operation, metadata);
      return result;
    })
    .catch(error => {
      debugSystem.endTimer(operationId, component, operation, metadata);
      debugSystem.log('error', component, operation, metadata, error.message);
      throw error;
    });
}

// Performance monitoring decorator
export function monitored(component: string, operation: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const operationId = `${component}-${operation}-${Date.now()}`;
      return await timeOperation(operationId, component, operation, () => method.apply(this, args));
    };
  };
}