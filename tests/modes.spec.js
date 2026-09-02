import {
  ACTIVE_SESSION_KEY, answerCurrent, expect, openApp,
  startMode, test, waitForPhase
} from './helpers.js';

test('la campagne expose ses verrous et démarre le premier secteur', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-action="campaign"]').first().click();
  await expect(page.locator('.campaign-map')).toBeVisible();
  await expect(page.locator('.sector-node')).toHaveCount(5);
  const sectorButtons = page.locator('[data-action="start-sector"]');
  await expect(sectorButtons).toHaveCount(5);
  await expect(sectorButtons.first()).toBeEnabled();
  for (let index = 1; index < 5; index += 1) await expect(sectorButtons.nth(index)).toBeDisabled();

  await sectorButtons.first().click();
  await waitForPhase(page, 'answering');
  const campaign = await page.evaluate(() => ({
    mode: window.EchoRiftApp.session.config.mode,
    sectorId: window.EchoRiftApp.session.campaignSector.id,
    questionCount: window.EchoRiftApp.session.config.questionCount
  }));
  expect(campaign.mode).toBe('campaign');
  expect(campaign.sectorId).toBeTruthy();
  expect(campaign.questionCount).toBe(10);
});

test('le mode endless consomme trois vies puis affiche un état de défaite', async ({ page }) => {
  await openApp(page);
  await startMode(page, 'endless');
  for (let round = 0; round < 3; round += 1) {
    await answerCurrent(page, { correct: false });
    await waitForPhase(page, 'reveal');
    await expect.poll(() => page.evaluate(
      () => window.EchoRiftApp.session.players[0].lives
    )).toBe(2 - round);
    await page.locator('[data-action="next-question"]').click();
    if (round < 2) await waitForPhase(page, 'answering');
  }
  await expect(page.locator('.results-page')).toBeVisible();
  await expect(page.locator('.results-hero')).toHaveClass(/defeat/);
  await expect(page.locator('.results-hero h1')).toHaveText('La faille s’est effondrée');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), ACTIVE_SESSION_KEY)).toBeNull();
});
