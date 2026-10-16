import assert from 'node:assert/strict';
import { openLiveSession } from './live-support.mjs';
import { selectTheme } from './theme-control.mjs';

const session = await openLiveSession('media-controls');
try {
  for (const [route, ready] of [['settings?tab=vision', '编辑默认识图模型'], ['media-providers/tts', '生成试听']]) {
    await session.page.goto(session.base + '/dashboard/' + route);
    await session.page.getByRole('button', { name: ready, exact: true }).waitFor();
    for (const width of [1440, 768, 375, 320]) {
      await session.page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await selectTheme(session.page, theme);
        await session.page.evaluate(() => document.fonts.ready);
        await session.page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
        assert(await session.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width} ${theme} overflow`);
        const file = `${session.directory}/${route.split('?')[0].replaceAll('/', '-')}-${width}-${theme}.png`;
        await session.page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        session.report.screenshots.push({ route, width, theme, file });
      }
    }
  }
  session.check('真实配置：两页、四种屏宽、深浅主题，无页面横向溢出');
  assert(session.report.writes.every(write => write.path === '/api/auth/login'), 'Visual checks must not mutate production settings');
  assert.deepEqual(session.report.errors, []);
  await session.finish();
} catch (failure) {
  await session.finish(failure);
  throw failure;
}
