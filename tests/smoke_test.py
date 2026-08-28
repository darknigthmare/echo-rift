"""Test de fumée ECHO RIFT avec Playwright.
Le test injecte les fichiers dans une page opaque afin de contourner les restrictions réseau du bac à sable.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def combined_html() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '')
    html = html.replace('<link rel="icon" href="assets/icon.svg" type="image/svg+xml">', '')
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / "styles.css").read_text(encoding="utf-8") + '</style>')
    for name in ["content.js", "storage.js", "audio-engine.js", "game.js"]:
        html = html.replace(f'<script src="{name}"></script>', '<script>' + (ROOT / name).read_text(encoding="utf-8") + '</script>')
    return html


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
        page.on("console", lambda msg: errors.append(f"console {msg.type}: {msg.text}") if msg.type == "error" else None)
        page.set_content(combined_html(), wait_until="load")
        page.wait_for_selector(".home-layout")

        # Navigation de base.
        assert page.locator(".mode-card").count() == 4
        page.click('[data-action="setup"][data-mode="solo"]')
        page.wait_for_selector("#setup-form")
        page.select_option('select[name="questions"]', "8")
        page.click('#setup-form button[type="submit"]')
        page.wait_for_function("window.EchoRiftApp && window.EchoRiftApp.session && window.EchoRiftApp.session.phase === 'answering'", timeout=30000)
        assert page.locator(".answer-portal").count() == 4

        # Termine une partie solo en répondant toujours juste.
        for question in range(8):
            answer = page.evaluate("window.EchoRiftApp.session.question.answerIndex")
            page.keyboard.press(str(answer + 1))
            page.wait_for_function("window.EchoRiftApp.session.phase === 'reveal'", timeout=5000)
            assert page.locator(".answer-portal.correct").count() == 1
            page.click('[data-action="next-question"]')
            if question < 7:
                page.wait_for_function("window.EchoRiftApp.session.phase === 'answering'", timeout=30000)

        page.wait_for_selector(".results-page")
        assert "Faille stabilisée" in page.locator(".results-hero h1").inner_text()
        assert page.evaluate("window.EchoRiftApp.profile.gamesPlayed") == 1

        # Vérifie la campagne, le musée et les paramètres.
        page.click('[data-action="home"]')
        page.click('[data-action="campaign"]')
        page.wait_for_selector(".campaign-map")
        assert page.locator(".sector-node").count() == 5
        page.click('[data-action="home"]')
        page.click('[data-action="archive"]')
        page.wait_for_selector(".track-grid")
        assert page.locator(".track-card").count() == 72
        page.click('[data-action="home"]')
        page.click('[data-action="settings"]')
        page.wait_for_selector("#settings-form")
        page.fill('input[name="profile-name"]', "Testeur")
        page.click('#settings-form button[type="submit"]')
        page.wait_for_selector(".home-layout")
        assert page.evaluate("window.EchoRiftApp.profile.name") == "Testeur"

        # Capture finale de référence.
        page.screenshot(path=str(ROOT / "tests" / "home-tested.png"), full_page=True)
        if errors:
            raise AssertionError("Erreurs navigateur:\n" + "\n".join(errors))
        print("ECHO RIFT smoke test: OK")
        browser.close()


if __name__ == "__main__":
    main()
