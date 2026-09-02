import {
  ACTIVE_SESSION_KEY, PROFILE_KEY, answerCurrent, expect, openApp,
  startMode, test, waitForPhase
} from './helpers.js';

test('le premier lancement présente le jeu puis mémorise l’onboarding', async ({ page }) => {
  await openApp(page, { firstLaunch: true });
  await expect(page.locator('.onboarding-hero h1')).toContainText('Écoute le signal');
  await expect(page.locator('.onboarding-steps article')).toHaveCount(3);
  await page.locator('[data-action="onboarding-audio"]').click();
  await expect(page.locator('.toast-success')).toContainText('Signal reçu');
  await page.locator('[data-action="onboarding-play"]').click();
  await expect(page.locator('#setup-form')).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).onboardingComplete, PROFILE_KEY)).toBe(true);
  await page.reload();
  await expect(page.locator('.home-layout')).toBeVisible();
  await expect(page.locator('.onboarding-page')).toHaveCount(0);
});

test('une partie solo complète produit une victoire et enregistre la progression', async ({ page }) => {
  await openApp(page);
  await startMode(page, 'solo', { questions: 8 });
  for (let question = 0; question < 8; question += 1) {
    await answerCurrent(page, { correct: true });
    await waitForPhase(page, 'reveal');
    await expect(page.locator('.answer-portal.correct')).toHaveCount(1);
    await page.locator('[data-action="next-question"]').click();
    if (question < 7) await waitForPhase(page, 'answering');
  }
  await expect(page.locator('.results-page')).toBeVisible();
  await expect(page.locator('.results-hero')).toHaveClass(/victory/);
  await expect(page.locator('.results-hero h1')).toHaveText('Faille stabilisée');
  await expect(page.locator('.results-hero p')).toContainText('8 bonnes réponses sur 8');
  const persisted = await page.evaluate(({ profileKey, sessionKey }) => ({
    profile: JSON.parse(localStorage.getItem(profileKey)),
    session: localStorage.getItem(sessionKey)
  }), { profileKey: PROFILE_KEY, sessionKey: ACTIVE_SESSION_KEY });
  expect(persisted.profile.gamesPlayed).toBe(1);
  expect(persisted.profile.correctAnswers).toBe(8);
  expect(persisted.profile.totalAnswers).toBe(8);
  expect(persisted.profile.discovered.length).toBeGreaterThan(0);
  expect(persisted.session).toBeNull();
});

test('la sauvegarde automatique survit à un reload et reprend la même manche', async ({ page }) => {
  await openApp(page);
  await startMode(page, 'solo', { questions: 8 });
  await answerCurrent(page, { correct: true });
  await waitForPhase(page, 'reveal');
  await page.locator('[data-action="next-question"]').click();
  await waitForPhase(page, 'answering');
  const beforeReload = await page.evaluate(sessionKey => {
    const saved = JSON.parse(localStorage.getItem(sessionKey));
    return {
      questionIndex: saved.questionIndex,
      questionId: saved.question.id,
      score: saved.players[0].score,
      phase: saved.phase
    };
  }, ACTIVE_SESSION_KEY);
  expect(beforeReload.questionIndex).toBe(1);
  expect(beforeReload.score).toBeGreaterThan(0);
  expect(beforeReload.phase).toBe('answering');
  await page.reload();
  await expect(page.locator('.resume-card')).toContainText('signal 2');
  await page.locator('.resume-card [data-action="resume-session"]').click();
  await waitForPhase(page, 'paused');
  const restored = await page.evaluate(() => ({
    questionIndex: window.EchoRiftApp.session.questionIndex,
    questionId: window.EchoRiftApp.session.question.id,
    score: window.EchoRiftApp.session.players[0].score
  }));
  expect(restored).toEqual({
    questionIndex: beforeReload.questionIndex,
    questionId: beforeReload.questionId,
    score: beforeReload.score
  });
  await page.locator('[data-action="retry-audio"]').click();
  await waitForPhase(page, 'answering');
});
