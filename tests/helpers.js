import { test as base, expect } from '@playwright/test';

const PROFILE_KEY = 'echo-rift-profile-v1';
const SETTINGS_KEY = 'echo-rift-settings-v1';
const ACTIVE_SESSION_KEY = 'echo-rift-active-session-v1';

const defaultProfile = {
  name: 'Testeur QA', level: 1, xp: 0, credits: 0, gamesPlayed: 0,
  correctAnswers: 0, totalAnswers: 0, bestScore: 0, bestStreak: 0,
  discovered: [], achievements: [], campaign: {}, lastMode: 'solo',
  onboardingComplete: true
};

const deterministicSettings = {
  volume: 0.05,
  reducedMotion: true,
  highContrast: false,
  visualizer: false,
  screenShake: false,
  language: 'fr'
};

export const test = base.extend({
  runtimeErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    await use(errors);
    expect(errors, 'La console du navigateur doit rester sans erreur').toEqual([]);
  }, { auto: true }]
});

export { expect, PROFILE_KEY, ACTIVE_SESSION_KEY };

export async function openApp(page, options = {}) {
  const profile = options.firstLaunch ? null : { ...defaultProfile, ...(options.profile || {}) };
  await page.addInitScript(({ profileKey, settingsKey, profileValue, settingsValue }) => {
    if (sessionStorage.getItem('echo-rift-qa-seeded') === '1') return;
    localStorage.clear();
    localStorage.setItem(settingsKey, JSON.stringify(settingsValue));
    if (profileValue) localStorage.setItem(profileKey, JSON.stringify(profileValue));
    sessionStorage.setItem('echo-rift-qa-seeded', '1');
  }, {
    profileKey: PROFILE_KEY,
    settingsKey: SETTINGS_KEY,
    profileValue: profile,
    settingsValue: deterministicSettings
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.EchoRiftApp));
  await expect(page.locator(options.firstLaunch ? '.onboarding-page' : '.home-layout')).toBeVisible();
}

export async function waitForPhase(page, phase, timeout = 30_000) {
  await page.waitForFunction(
    expected => window.EchoRiftApp?.session?.phase === expected,
    phase,
    { timeout }
  );
}

async function activate(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

export async function startMode(page, mode, options = {}) {
  const touch = Boolean(options.touch);
  await activate(page.locator(`[data-action="setup"][data-mode="${mode}"]`).first(), touch);
  const form = page.locator('#setup-form');
  await expect(form).toBeVisible();

  if (mode === 'party') {
    const players = Number(options.players || 4);
    await page.locator('#player-count').selectOption(String(players));
    const names = options.names || ['Nova', 'Pulse', 'Rift', 'Echo'];
    await expect(form.locator('[name^="player-name-"]')).toHaveCount(players);
    for (let index = 0; index < players; index += 1) {
      await form.locator(`[name="player-name-${index}"]`).fill(names[index]);
    }
  }

  if (mode !== 'endless') {
    await form.locator('select[name="questions"]').selectOption(String(options.questions || 8));
  }
  await form.locator('input[name="difficulty"][value="discovery"]').check();
  if (options.classicOnly !== false) {
    await form.locator('input[name="types"]').evaluateAll(inputs => {
      inputs.forEach(input => { input.checked = input.value === 'classic'; });
    });
  }
  await activate(form.locator('button[type="submit"]'), touch);
  await waitForPhase(page, 'answering');
  await expect(page.locator('.answer-portal')).toHaveCount(4);
}

export async function answerCurrent(page, options = {}) {
  const answerIndex = await page.evaluate(() => window.EchoRiftApp.session.question.answerIndex);
  const optionIndex = options.optionIndex == null
    ? (options.correct === false ? (answerIndex + 1) % 4 : answerIndex)
    : options.optionIndex;
  const portal = page.locator(`[data-action="answer"][data-option="${optionIndex}"]`);
  if (options.touch) await portal.tap();
  else await portal.click();
  return optionIndex;
}

export async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0)
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
