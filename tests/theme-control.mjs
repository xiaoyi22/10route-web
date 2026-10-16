export async function selectTheme(page, value) {
  const names = { light: '浅色', dark: '深色', system: '跟随系统' };
  const radio = page.getByRole('radiogroup', { name: '主题模式' }).getByRole('radio', { name: names[value], exact: true });
  if (await page.locator('dialog[open]').count()) await radio.evaluate(element => element.click());
  else await radio.check();
  await page.waitForFunction(mode => document.documentElement.dataset.theme === (mode === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : mode), value);
}
