import {
  answerCurrent, expect, expectNoHorizontalOverflow, openApp,
  startMode, test, waitForPhase
} from './helpers.js';

test('@mobile la Party tactile J1-J4 garde les choix secrets et ne déborde pas horizontalement', async ({ page }) => {
  await openApp(page);
  await expectNoHorizontalOverflow(page);

  const names = ['Nova', 'Pulse', 'Rift', 'Echo'];
  await startMode(page, 'party', { players: 4, names, questions: 8, touch: true });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('.touch-player-selector [data-action="touch-player"]')).toHaveCount(4);

  const choices = [0, 1, 2, 3];
  for (let playerIndex = 0; playerIndex < 4; playerIndex += 1) {
    await page.locator(`[data-action="touch-player"][data-player="${playerIndex}"]`).tap();
    await answerCurrent(page, { optionIndex: choices[playerIndex], touch: true });

    if (playerIndex < 3) {
      await expect.poll(() => page.evaluate(
        index => window.EchoRiftApp.session.players[index].answer,
        playerIndex
      )).toBe(choices[playerIndex]);
      await expect(page.locator('.answer-markers i')).toHaveCount(0);
      await expect(page.locator('.answer-portal.correct')).toHaveCount(0);
      await expect(page.locator('.answer-portal.wrong')).toHaveCount(0);
      const labels = await page.locator('.answer-portal').evaluateAll(portals =>
        portals.map(portal => portal.getAttribute('aria-label')).join(' ')
      );
      expect(labels).not.toMatch(/Bonne réponse|incorrecte sélectionnée/);
    }
  }

  await waitForPhase(page, 'reveal');
  await expect(page.locator('.answer-markers i')).toHaveCount(4);
  await expect(page.locator('.answer-portal.correct')).toHaveCount(1);
  for (const name of names) {
    await expect(page.locator(`.answer-markers i[title="${name}"]`)).toHaveCount(1);
  }
  await expectNoHorizontalOverflow(page);
});
