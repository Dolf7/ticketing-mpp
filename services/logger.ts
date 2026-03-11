export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function timestamp() {
  return new Date().toISOString();
}

export function createLogger(name: string) {
  const pref = `[${name}]`;
  return {
    debug: (...msg: any[]) => console.debug(`${timestamp()} ${pref} DEBUG:`, ...msg),
    info: (...msg: any[]) => console.log(`${timestamp()} ${pref} INFO:`, ...msg),
    warn: (...msg: any[]) => console.warn(`${timestamp()} ${pref} WARN:`, ...msg),
    error: (...msg: any[]) => console.error(`${timestamp()} ${pref} ERROR:`, ...msg),
  };
}

export default createLogger;
