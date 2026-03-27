import { BrowserContext } from '@playwright/test';

export async function authenticateContext(context: BrowserContext): Promise<void> {
  // Use url instead of domain/path for reliable localhost cookie injection
  await context.addCookies([{
    name: 'auth-token',
    value: 'mock-jwt-token',
    url: 'http://localhost:3001',
    httpOnly: false,
    secure: false,
  }]);
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-token');
  });
}
