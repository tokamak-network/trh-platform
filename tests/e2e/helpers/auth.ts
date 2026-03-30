import { BrowserContext, Page } from '@playwright/test';

/** Inject mock auth token for MSW-mode tests (port 3009) */
export async function authenticateContext(context: BrowserContext): Promise<void> {
  await context.addCookies([{
    name: 'auth-token',
    value: 'mock-jwt-token',
    url: 'http://localhost:3009',
    httpOnly: false,
    secure: false,
  }]);
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-token');
  });
}

/** Login to the real platform backend (port 3000) and inject the real JWT token */
export async function authenticateReal(
  context: BrowserContext,
  opts: { email?: string; password?: string } = {}
): Promise<string> {
  const { email = 'admin@gmail.com', password = 'admin' } = opts;

  // Call the real backend login API
  const response = await context.request.post('http://localhost:8000/api/v1/auth/login', {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json();
  const token: string = body.token ?? body.data?.token ?? '';

  if (!token) throw new Error(`Login failed: ${JSON.stringify(body)}`);

  // Inject into all pages opened by this context
  await context.addCookies([{
    name: 'auth-token',
    value: token,
    url: 'http://localhost:3000',
    httpOnly: false,
    secure: false,
  }]);
  await context.addInitScript((t: string) => {
    localStorage.setItem('accessToken', t);
  }, token);

  return token;
}

/** Navigate to a page and wait for auth to be injected (for real-backend tests) */
export async function gotoAuthenticated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // If redirected to login, wait for automatic re-auth via localStorage
  await page.waitForLoadState('networkidle', { timeout: 15000 });
}
