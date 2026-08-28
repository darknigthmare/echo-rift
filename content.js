/* ECHO RIFT — contenu original. Aucun extrait commercial n'est inclus. */
(function () {
  'use strict';

  const CATEGORIES = {
    arcade: {
      id: 'arcade', label: 'Arcade 8-bit', icon: '▦', accent: '#67f7ff',
      description: 'Pulsations carrées, arpèges rapides et énergie de borne rétro.'
    },
    horror: {
      id: 'horror', label: 'Horreur', icon: '◉', accent: '#ff557d',
      description: 'Drones dissonants, respirations et couloirs qui grincent.'
    },
    space: {
      id: 'space', label: 'Science-fiction', icon: '✦', accent: '#8b7bff',
      description: 'Balises orbitales, nappes stellaires et poursuites intersidérales.'
    },
    fantasy: {
      id: 'fantasy', label: 'Fantasy', icon: '◇', accent: '#ffd36a',
      description: 'Luths synthétiques, marches héroïques et magie ancienne.'
    },
    cyber: {
      id: 'cyber', label: 'Cyber', icon: '⌁', accent: '#ff65e6',
      description: 'Basses numériques, pluie de néons et protocoles clandestins.'
    },
    industrial: {
      id: 'industrial', label: 'Industriel', icon: '⚙', accent: '#ff9a52',
      description: 'Pistons, métal, presses et rythmes mécaniques.'
    },
    ocean: {
      id: 'ocean', label: 'Abysses', icon: '≈', accent: '#4bbcff',
      description: 'Sonars, courants profonds et chants subaquatiques.'
    },
    desert: {
      id: 'desert', label: 'Désert mystique', icon: '△', accent: '#ffc15a',
      description: 'Percussions sèches, mirages et gammes orientales.'
    },
    dream: {
      id: 'dream', label: 'Onirique', icon: '☾', accent: '#bca7ff',
      description: 'Cloches douces, souvenirs flous et hôtels impossibles.'
    },
    mystery: {
      id: 'mystery', label: 'Mystère / Espionnage', icon: '⌕', accent: '#a9e6c4',
      description: 'Contrebasse feutrée, dossiers secrets et pluie nocturne.'
    },
    signals: {
      id: 'signals', label: 'Bruits iconiques', icon: '◌', accent: '#f5f7ff',
      description: 'Portes, alarmes, téléportations, machines et créatures.'
    }
  };

  const musicDefinitions = {
    arcade: [
      ['Neon Continue', 'Bit Division', 152, 64, 1101, 2],
      ['Coinstorm Circuit', 'Pixel Pilot', 168, 67, 1102, 2],
      ['Boss Room 88', 'Raster King', 138, 57, 1103, 3],
      ['Turbo Cartridge', 'Joyline', 180, 62, 1104, 3],
      ['Extra Life Parade', 'CRT Kids', 144, 69, 1105, 1],
      ['Glitch Castle', 'Byte Baron', 126, 60, 1106, 4]
    ],
    horror: [
      ['Corridor 13', 'Hollow Choir', 58, 38, 1201, 2],
      ['The Lamp Goes Out', 'Nocturne Ward', 64, 41, 1202, 3],
      ['Breath Behind Glass', 'Pale Signal', 52, 36, 1203, 4],
      ['Red Nursery', 'Static Widow', 72, 45, 1204, 3],
      ['Footsteps Below', 'Ash Tenant', 60, 33, 1205, 2],
      ['Last Candle', 'Mourning Circuit', 48, 40, 1206, 5]
    ],
    space: [
      ['Orbital Wake', 'Helios Vector', 118, 52, 1301, 2],
      ['Kuiper Run', 'Nova Relay', 142, 55, 1302, 3],
      ['Silent Docking', 'Aster Vale', 86, 47, 1303, 2],
      ['Redshift Pursuit', 'Quasar Unit', 156, 50, 1304, 4],
      ['Moonfall Beacon', 'Lunar Array', 104, 59, 1305, 3],
      ['Event Horizon Waltz', 'Deepfield', 90, 44, 1306, 5]
    ],
    fantasy: [
      ['Crown of Moss', 'Elder Thread', 96, 55, 1401, 1],
      ['Dragonwake', 'Ember Bard', 128, 50, 1402, 3],
      ['Runestone March', 'North Hollow', 112, 45, 1403, 2],
      ['Lanterns of Avel', 'Silver Grove', 84, 62, 1404, 2],
      ['The Glass Griffin', 'Myth Loom', 120, 57, 1405, 4],
      ['Siege of Dawnkeep', 'Brass Wyvern', 136, 48, 1406, 5]
    ],
    cyber: [
      ['Firewall Heartbeat', 'Null City', 124, 43, 1501, 2],
      ['Chrome Rain', 'Synthetic Avenue', 116, 51, 1502, 2],
      ['Ghost in Channel 9', 'Proxy Bloom', 132, 46, 1503, 3],
      ['Neon Pursuer', 'Kernel Panic', 150, 41, 1504, 4],
      ['Data Cathedral', 'Vector Saint', 108, 54, 1505, 4],
      ['Midnight Protocol', 'Cipher Youth', 128, 49, 1506, 5]
    ],
    industrial: [
      ['Assembly Line Zero', 'Iron Rhythm', 122, 38, 1601, 2],
      ['Furnace Choir', 'Foundry Dogs', 110, 35, 1602, 3],
      ['Piston Rebellion', 'Gearmouth', 138, 40, 1603, 3],
      ['Hydraulic Crown', 'Steel Parish', 96, 33, 1604, 4],
      ['Warning Stripe', 'Factory Ghost', 130, 42, 1605, 2],
      ['Rivetstorm', 'Black Conveyor', 148, 36, 1606, 5]
    ],
    ocean: [
      ['Abyssal Garden', 'Blue Lantern', 78, 50, 1701, 1],
      ['Sonar Dreams', 'Pelagic', 72, 57, 1702, 2],
      ['Coral Machine', 'Tide Circuit', 106, 54, 1703, 3],
      ['Below the Thermocline', 'Deep Current', 64, 43, 1704, 4],
      ['Glass Whale', 'Salt Memory', 82, 47, 1705, 3],
      ['Pressure Bloom', 'Trench Choir', 68, 39, 1706, 5]
    ],
    desert: [
      ['Sand Compass', 'Dune Cartographer', 102, 52, 1801, 1],
      ['Obsidian Caravan', 'Heat Mirage', 118, 48, 1802, 3],
      ['Sunken Temple Signal', 'Nomad Array', 88, 45, 1803, 2],
      ['Scorpion Moon', 'Brass Oasis', 126, 50, 1804, 4],
      ['Dust Oracle', 'Saffron Static', 94, 43, 1805, 3],
      ['Seven Winds', 'Amber Route', 112, 55, 1806, 5]
    ],
    dream: [
      ['Paper Moon Hotel', 'Soft Focus', 76, 60, 1901, 1],
      ['Sleepwalk Arcade', 'Velvet Pixel', 92, 57, 1902, 2],
      ['Cloud Elevator', 'Lucid Transit', 82, 64, 1903, 2],
      ['Carousel at 3AM', 'Porcelain Radio', 108, 55, 1904, 3],
      ['Memory Aquarium', 'Slow Halo', 70, 50, 1905, 4],
      ['Bedroom Planetarium', 'Lullaby Engine', 88, 62, 1906, 5]
    ],
    mystery: [
      ['Velvet Alibi', 'The Quiet File', 92, 45, 2001, 1],
      ['Room 404', 'Missing Witness', 104, 48, 2002, 2],
      ['Rain on the Dossier', 'Grey Bureau', 86, 43, 2003, 2],
      ['The Third Key', 'Cipher Lounge', 118, 50, 2004, 3],
      ['Midnight Interrogation', 'Low Profile', 78, 40, 2005, 4],
      ['Exit Through the Mirror', 'Case Closed', 110, 46, 2006, 5]
    ]
  };

  const signalDefinitions = [
    ['Teleport Gate', 'Un anneau d’énergie se charge puis se referme.', 'teleport', 3001, 2],
    ['Plasma Charge', 'Une arme énergétique monte en puissance.', 'plasma', 3002, 2],
    ['Coin Pickup', 'Un objet bonus est récupéré dans un jeu rétro.', 'coin', 3003, 1],
    ['Ancient Door', 'Une lourde porte de pierre mécanisée s’ouvre.', 'door', 3004, 2],
    ['Creature Growl', 'Une créature massive approche dans l’obscurité.', 'growl', 3005, 3],
    ['Warning Siren', 'Une alarme d’évacuation industrielle retentit.', 'siren', 3006, 1],
    ['Magic Rune', 'Un symbole magique s’active et libère son énergie.', 'rune', 3007, 2],
    ['Robot Startup', 'Un automate démarre ses systèmes un par un.', 'robot', 3008, 2],
    ['Underwater Sonar', 'Un sonar balaie les profondeurs.', 'sonar', 3009, 1],
    ['Racing Boost', 'Un moteur futuriste déclenche sa postcombustion.', 'boost', 3010, 2],
    ['Broken Radio', 'Une transmission parasitée cherche une fréquence.', 'radio', 3011, 3],
    ['Heart Scanner', 'Un capteur biométrique détecte un rythme vital.', 'scanner', 3012, 2]
  ];

  const TRACKS = [];
  Object.entries(musicDefinitions).forEach(([category, rows]) => {
    rows.forEach((row, index) => {
      const [title, artist, bpm, root, seed, difficulty] = row;
      TRACKS.push({
        id: `${category}-${index + 1}`,
        title,
        artist,
        category,
        kind: 'music',
        bpm,
        root,
        seed,
        difficulty,
        duration: 8,
        sourceType: 'procedural'
      });
    });
  });

  signalDefinitions.forEach((row, index) => {
    const [title, artist, sfxType, seed, difficulty] = row;
    TRACKS.push({
      id: `signals-${index + 1}`,
      title,
      artist,
      category: 'signals',
      kind: 'sfx',
      sfxType,
      seed,
      difficulty,
      duration: 5,
      sourceType: 'procedural'
    });
  });

  const CAMPAIGN_SECTORS = [
    {
      id: 'sector-arcade', name: 'Le Quartier des Pixels', icon: '▦',
      description: 'Répare les bornes de l’Archive et apprends à distinguer les motifs les plus francs.',
      categories: ['arcade', 'signals'], target: [6500, 9000, 11500]
    },
    {
      id: 'sector-shadows', name: 'Les Couloirs Sans Lumière', icon: '◉',
      description: 'Les échos horrifiques se dissimulent dans les parasites et les silences.',
      categories: ['horror', 'mystery'], target: [7000, 9800, 12500]
    },
    {
      id: 'sector-orbit', name: 'L’Anneau Orbital', icon: '✦',
      description: 'Poursuites stellaires, balises perdues et protocoles cybernétiques.',
      categories: ['space', 'cyber'], target: [7500, 10200, 13200]
    },
    {
      id: 'sector-echoes', name: 'Les Royaumes Résonnants', icon: '◇',
      description: 'Mythes, déserts et rêves se superposent dans une même partition.',
      categories: ['fantasy', 'desert', 'dream'], target: [8000, 10800, 13800]
    },
    {
      id: 'sector-core', name: 'Le Cœur du Parasite', icon: '⚙',
      description: 'Une série experte où tous les mondes se mélangent avant le medley final.',
      categories: ['industrial', 'ocean', 'arcade', 'horror', 'space', 'fantasy', 'cyber', 'desert', 'dream', 'mystery', 'signals'],
      target: [8500, 11500, 15000], boss: true
    }
  ];

  const QUESTION_TYPES = {
    classic: { id: 'classic', label: 'Écho classique', icon: '♫', description: 'Reconnaître le titre de l’écho.' },
    signal: { id: 'signal', label: 'Univers sonore', icon: '◎', description: 'Reconnaître la famille sonore.' },
    lightning: { id: 'lightning', label: 'Éclair', icon: 'ϟ', description: 'Un fragment très court, peu de temps pour répondre.' },
    fracture: { id: 'fracture', label: 'Fracture', icon: '⌁', description: 'Écho filtré, accéléré, ralenti ou inversé.' },
    memory: { id: 'memory', label: 'Mémoire', icon: '◫', description: 'Trois échos passent : retrouve celui du milieu.' }
  };

  const ACHIEVEMENTS = [
    { id: 'first-game', title: 'Première brèche', description: 'Terminer une partie.', icon: '✦' },
    { id: 'streak-5', title: 'Oreille absolue ?', description: 'Atteindre une série de 5 bonnes réponses.', icon: '♫' },
    { id: 'perfect', title: 'Archive intacte', description: 'Terminer une partie sans erreur.', icon: '◇' },
    { id: 'speed', title: 'Réflexe éclair', description: 'Répondre juste en moins de 2 secondes.', icon: 'ϟ' },
    { id: 'discover-25', title: 'Collectionneur', description: 'Découvrir 25 échos différents.', icon: '▦' },
    { id: 'campaign-clear', title: 'Cœur stabilisé', description: 'Terminer le dernier secteur de la campagne.', icon: '◉' }
  ];

  window.EchoContent = {
    CATEGORIES,
    TRACKS,
    CAMPAIGN_SECTORS,
    QUESTION_TYPES,
    ACHIEVEMENTS
  };
})();
