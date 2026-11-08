const baseUrl = import.meta.env.BASE_URL ?? '/';

export function withBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (baseUrl === '/') return normalizedPath;
  return `${baseUrl.replace(/\/$/, '')}${normalizedPath}`;
}
