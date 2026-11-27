/* Kiez-Könige – Spieldaten: Viertel, Geschäfte, Wetter, Ereignisse */
(function (G) {
    'use strict';
    var K = {};

    K.version = '2.0';
    K.startCash = 20000;
    K.loanStep = 10000;
    K.loanMax = 30000;
    K.loanRate = 0.005;          // 0,5 % Zinsen pro Tag
    K.rentBase = 200;            // Pacht pro Tag (× Viertel-Faktor)
    K.sellBack = 0.5;            // Verkauf bringt 50 % der Investition zurück
    K.assetValue = 0.6;          // Firmenwert zählt mit 60 % der Investition
    K.marketing = { cost: 1500, days: 3, boost: 0.5 };
    K.rating = { start: 3.5, weight: 0.25 };   // Kundenbewertung 1–5 Sterne: ±0,25 Attraktivität je Stern über/unter 3,5
    K.missionBonus = [800, 1200, 1600];       // Belohnung der Tagesaufgabe (leicht, mittel, schwer)
    K.outside = 0.8;             // Gewicht für „nichts kaufen“
    K.dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    K.players = [
        { name: 'Spieler 1', color: '#22d3ee' },
        { name: 'Spieler 2', color: '#f472b6' }
    ];
    K.looks = {
        hats: [['cap', '🧢', 'Kappe'], ['hair', '💇', 'Frisur'], ['top', '🎩', 'Zylinder'], ['party', '🥳', 'Partyhut'], ['ears', '🐱', 'Katzenohren'], ['none', '🙂', 'Ohne']],
        faces: [['smile', '🙂', 'Lächeln'], ['cool', '😎', 'Cool'], ['grin', '😁', 'Grinsen'], ['wink', '😉', 'Zwinkern']],
        skins: ['#f1c27d', '#ffdbac', '#c68642', '#8d5524']
    };

    /* Vier Viertel als 2 × 2-Raster: 0 Altstadt (links oben), 1 Uni (rechts oben), 2 Büro (links unten), 3 Wohnen (rechts unten) */
    K.districts = [
        { id: 'altstadt', name: 'Altstadt', short: 'Altstadt', color: '#f59e0b', ground: '#4a3a26', plastic: '#f6b44e', traffic: 3400, rent: 1.5, sens: 0.8, weekend: 1.35,
            who: 'Touristen & Bummler', hint: 'Viel Laufkundschaft, hohe Pacht. Eis und Café laufen hier super.' },
        { id: 'uni', name: 'Uni-Viertel', short: 'Uni', color: '#22d3ee', ground: '#1f3d4a', plastic: '#4fc3e8', traffic: 3200, rent: 0.8, sens: 1.6, weekend: 0.6,
            who: 'Studierende', hint: 'Sehr preisbewusst! Günstiger Kiosk, Imbiss und Gaming sind gefragt.' },
        { id: 'buero', name: 'Büropark', short: 'Büro', color: '#a78bfa', ground: '#33304a', plastic: '#a993f0', traffic: 3000, rent: 1.2, sens: 0.7, weekend: 0.25,
            who: 'Büroleute', hint: 'Zahlen gern mehr – aber am Wochenende ist es leer.' },
        { id: 'wohn', name: 'Wohngebiet', short: 'Wohnen', color: '#4ade80', ground: '#24432f', plastic: '#7fd88a', traffic: 2800, rent: 0.7, sens: 1.1, weekend: 1.4,
            who: 'Familien', hint: 'Günstige Pacht, am Wochenende viel los. Eis und Fitness mögen Familien.' }
    ];
    K.neighbors = { 0: [1, 2], 1: [0, 3], 2: [0, 3], 3: [1, 2] };

    /* 16 Grundstücke: 4 × 4-Raster, je Viertel 2 × 2 */
    K.plots = [];
    for (var gy = 0; gy < 4; gy++) for (var gx = 0; gx < 4; gx++) {
        var d = (gx < 2 ? 0 : 1) + (gy < 2 ? 0 : 2);
        var corner = (gx === 1 || gx === 2) && (gy === 1 || gy === 2);   // an der Kreuzung: etwas teurer, etwas mehr Kunden
        K.plots.push({ id: K.plots.length, gx: gx, gy: gy, d: d, corner: corner, rent: Math.round(K.rentBase * K.districts[d].rent * (corner ? 1.25 : 1) / 10) * 10 });
    }

    /* Geschäftsarten. appeal: Beliebtheit je Viertel [Altstadt, Uni, Büro, Wohnen] */
    K.typeOrder = ['kiosk', 'bubbletea', 'eis', 'cafe', 'secondhand', 'imbiss', 'fitness', 'gaming'];
    K.types = {
        kiosk:   { name: 'Kiosk',          icon: '🗞️', color: '#f59e0b', build: 5000,  up: [4000, 7000],   cap: [500, 800, 1150], cost: 1.6, ref: 4.0,  wage: [150, 260, 380], share: 0.30, appeal: [0.9, 1.3, 1.0, 1.0], weather: { sun: 1, rain: 1.1, heat: 1.1 },
            desc: 'Günstig zu bauen, viele kleine Einkäufe.' },
        eis:     { name: 'Eisdiele',       icon: '🍦', color: '#f9a8d4', build: 8000,  up: [6000, 11000],  cap: [720, 1150, 1650], cost: 1.0, ref: 3.5,  wage: [200, 340, 500], share: 0.22, appeal: [1.5, 0.9, 0.6, 1.3], weather: { sun: 1.15, rain: 0.35, heat: 1.9 },
            desc: 'Gold wert bei Hitze – bei Regen fast leer.' },
        cafe:    { name: 'Café',           icon: '☕', color: '#b45309', build: 9000,  up: [7000, 12000],  cap: [650, 1050, 1500], cost: 1.4, ref: 4.5,  wage: [250, 420, 620], share: 0.25, appeal: [1.3, 1.0, 1.4, 0.8], weather: { sun: 1, rain: 1.25, heat: 0.85 },
            desc: 'Gute Marge, beliebt bei Büroleuten und Touristen.' },
        imbiss:  { name: 'Imbiss',         icon: '🍔', color: '#ef4444', build: 12000, up: [9000, 16000],  cap: [560, 900, 1300], cost: 3.4, ref: 8.0,  wage: [300, 500, 740], share: 0.20, appeal: [1.1, 1.3, 1.3, 0.8], weather: { sun: 1, rain: 1.05, heat: 0.9 },
            desc: 'Mittags voll. Höherer Einkaufspreis pro Portion.' },
        fitness: { name: 'Fitness-Studio', short: 'Fitness', icon: '🏋️', color: '#22c55e', build: 18000, up: [14000, 24000], cap: [420, 680, 980],  cost: 0.8, ref: 12.0, wage: [500, 800, 1150], share: 0.18, appeal: [0.7, 1.0, 1.3, 1.3], weather: { sun: 1, rain: 1.15, heat: 0.8 },
            desc: 'Teuer im Bau, wenige Kunden – aber fast alles ist Gewinn.' },
        bubbletea: { name: 'Bubble-Tea-Bar', short: 'Bubble-Tea', icon: '🥤', color: '#14b8a6', build: 7000, up: [5500, 9500], cap: [600, 950, 1400], cost: 1.7, ref: 5.0, wage: [200, 340, 500], share: 0.16, appeal: [1.1, 1.6, 0.9, 0.8], weather: { sun: 1.05, rain: 0.75, heat: 1.4 },
            desc: 'Trend-Getränk mit Perlen. Liebling im Uni-Viertel, bei Hitze top.' },
        secondhand: { name: 'Second-Hand-Laden', short: 'Second-Hand', icon: '👗', color: '#ec4899', build: 10000, up: [8000, 13000], cap: [360, 600, 880], cost: 4.5, ref: 12.0, wage: [260, 430, 640], share: 0.105, appeal: [1.2, 1.5, 0.7, 1.3], weather: { sun: 1, rain: 1.15, heat: 0.9 },
            desc: 'Gebrauchte Mode wie auf Vinted: günstig einkaufen, mit Gewinn weiterverkaufen.' },
        gaming:  { name: 'Gaming-Lounge', short: 'Gaming',  icon: '🎮', color: '#8b5cf6', build: 24000, up: [18000, 30000], cap: [470, 760, 1100],  cost: 2.5, ref: 15.0, wage: [550, 880, 1250], share: 0.14, appeal: [1.0, 1.6, 0.6, 1.0], weather: { sun: 0.95, rain: 1.3, heat: 1.0 },
            desc: 'Das große Ding fürs Uni-Viertel. Bei Regen voll.' }
    };
    K.quality = [1, 1.25, 1.5];
    K.levelNames = ['Stufe 1', 'Stufe 2', 'Stufe 3'];

    K.weather = {
        sun:  { name: 'Sonnig',      icon: '☀️', p: 0.55 },
        rain: { name: 'Regen',       icon: '🌧️', p: 0.28 },
        heat: { name: 'Hitzewelle',  icon: '🔥', p: 0.17 }
    };

    /* Ereignisse: traffic = Faktor je Viertel, typeMult = Nachfrage je Art, cost = Einkaufspreis-Faktor */
    K.events = [
        { id: 'stadtfest', icon: '🎪', title: 'Stadtfest in der Altstadt', text: 'Bühnen, Musik, tausende Besucher – die Altstadt platzt aus allen Nähten.', traffic: { 0: 1.8 } },
        { id: 'pruefungen', icon: '📚', title: 'Prüfungsphase an der Uni', text: 'Alle lernen. Kaffee läuft, fürs Zocken hat keiner Zeit.', typeMult: { uni: { cafe: 1.5, gaming: 0.5, kiosk: 1.2 } } },
        { id: 'messe', icon: '💼', title: 'Große Messe im Büropark', text: 'Hunderte Gäste aus aller Welt – und alle haben Hunger.', traffic: { 2: 1.7 } },
        { id: 'konzert', icon: '🎸', title: 'Open-Air im Wohngebiet', text: 'Ein Konzert im Park zieht die ganze Nachbarschaft an.', traffic: { 3: 1.6 } },
        { id: 'lieferengpass', icon: '🚚', title: 'Lieferengpass', text: 'Zutaten werden knapp: Imbiss und Café zahlen heute 40 % mehr im Einkauf.', cost: { imbiss: 1.4, cafe: 1.4 } },
        { id: 'influencer', icon: '📱', title: 'Influencer-Besuch', text: 'Eine bekannte Influencerin postet ein Video aus einem eurer Läden.', influencer: true },
        { id: 'fitnesstrend', icon: '💪', title: 'Fitness-Trend', text: 'Alle wollen plötzlich trainieren – die Studios sind gefragt wie nie.', typeAll: { fitness: 1.8 } },
        { id: 'esport', icon: '🏆', title: 'E-Sport-Finale', text: 'Das große Finale läuft – Gaming-Lounges sind heute voll.', typeAll: { gaming: 1.9 } },
        { id: 'ruhig', icon: '😴', title: 'Ruhiger Tag', text: 'Brückentag – die halbe Stadt ist im Urlaub.', trafficAll: 0.7 }
    ];

    /* Tageskurve (12 Stunden, 8–20 Uhr) je Viertel – nur für die Animation */
    K.hourCurve = [
        [0.4, 0.6, 0.8, 1.0, 1.1, 1.2, 1.3, 1.3, 1.2, 1.0, 0.8, 0.6],  // Altstadt
        [0.5, 0.9, 1.0, 1.0, 1.3, 1.0, 0.9, 1.0, 1.1, 1.2, 1.2, 1.0],  // Uni
        [0.9, 1.3, 1.1, 1.0, 1.8, 1.5, 0.9, 0.8, 0.7, 0.5, 0.3, 0.2],  // Büro
        [0.5, 0.6, 0.7, 0.8, 1.0, 0.9, 1.0, 1.2, 1.4, 1.5, 1.3, 1.0]   // Wohnen
    ];

    G.KKDATA = K;
})(typeof window !== 'undefined' ? window : globalThis);
