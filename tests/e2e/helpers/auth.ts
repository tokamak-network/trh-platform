import { BrowserContext } from '@playwright/test';

export async function authenticateContext(context: BrowserContext): Promise<void> {
  await context.addCookies([{
    name: 'auth-token',
    value: 'mock-jwt-token',
    domain: 'localhost',
    path: '/',
  }]);
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-token');
  });
}
