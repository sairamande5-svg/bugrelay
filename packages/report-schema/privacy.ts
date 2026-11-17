export const MAX_EVENTS = 80;
export const MAX_LOGS = 20;
export const MAX_PAYLOAD = '256kb';
export function cleanPath(input: string): string {
  const path = input.split(/[?#]/, 1)[0];
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path) || path.length > 300) return '/';
  return path.split('/').map(segment =>
    /^\d{7,}$|^[\da-f]{8}-[\da-f-]{27,}$|^[\w-]{28,}$|%40|@|%2f|%5c|%00/i.test(segment) ? '[redacted]' : segment
  ).join('/');
}
