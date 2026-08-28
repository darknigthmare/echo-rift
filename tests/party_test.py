from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def html():
    h=(ROOT/'index.html').read_text()
    h=h.replace('<link rel="manifest" href="manifest.webmanifest">','').replace('<link rel="icon" href="assets/icon.svg" type="image/svg+xml">','')
    h=h.replace('<link rel="stylesheet" href="styles.css">','<style>'+(ROOT/'styles.css').read_text()+'</style>')
    for f in ['content.js','storage.js','audio-engine.js','game.js']:
        h=h.replace(f'<script src="{f}"></script>','<script>'+(ROOT/f).read_text()+'</script>')
    return h

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html(),wait_until='load')
    page.wait_for_selector('.home-layout')
    page.click('[data-action="setup"][data-mode="party"]')
    page.select_option('#player-count','4')
    page.click('#setup-form button[type="submit"]')
    page.wait_for_function("window.EchoRiftApp.session.phase==='answering'",timeout=30000)
    assert len(page.evaluate('window.EchoRiftApp.session.players'))==4
    # Active l'analyse du joueur 2.
    page.click('[data-action="module"][data-player="1"][data-module="scan"]')
    assert len(page.evaluate('window.EchoRiftApp.session.players[1].eliminated'))==2
    correct=page.evaluate('window.EchoRiftApp.session.question.answerIndex')
    # Sélectionne une mauvaise réponse non éliminée pour J2.
    wrong=page.evaluate("([0,1,2,3].find(i=>i!==window.EchoRiftApp.session.question.answerIndex && !window.EchoRiftApp.session.players[1].eliminated.includes(i)))")
    maps=[['1','2','3','4'],['q','w','e','r'],['a','s','d','f'],['z','x','c','v']]
    page.keyboard.press(maps[0][correct])
    page.keyboard.press(maps[1][wrong])
    page.keyboard.press(maps[2][correct])
    page.keyboard.press(maps[3][correct])
    page.wait_for_function("window.EchoRiftApp.session.phase==='reveal'",timeout=5000)
    scores=page.evaluate('window.EchoRiftApp.session.players.map(p=>p.score)')
    assert scores[0]>0 and scores[1]==0 and scores[2]>0 and scores[3]>0, scores
    assert not errors, errors
    print('ECHO RIFT party test: OK')
    browser.close()
