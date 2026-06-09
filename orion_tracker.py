#!/usr/bin/env python3
"""
Orion Spacecraft Sky Tracker
Suivi en temps réel de la capsule Orion (NASA) depuis Samatan, France (32130)
Affiche la position dans le ciel et l'étoile repère la plus proche
pour alignement du Celestron 132mm motorisé.
"""

import sys
import os
import time
import math
import requests
from datetime import datetime, timezone

try:
    from skyfield.api import load, wgs84, EarthSatellite
    from skyfield.positionlib import Apparent
except ImportError:
    print("Installation des dépendances requises...")
    os.system(f"{sys.executable} -m pip install skyfield requests colorama")
    from skyfield.api import load, wgs84, EarthSatellite

try:
    from colorama import init, Fore, Style
    init()
    C_TITLE   = Fore.CYAN + Style.BRIGHT
    C_LABEL   = Fore.YELLOW
    C_VALUE   = Fore.WHITE + Style.BRIGHT
    C_STAR    = Fore.GREEN + Style.BRIGHT
    C_WARN    = Fore.RED + Style.BRIGHT
    C_INFO    = Fore.BLUE
    C_RESET   = Style.RESET_ALL
except ImportError:
    C_TITLE = C_LABEL = C_VALUE = C_STAR = C_WARN = C_INFO = C_RESET = ""

# ─── Observateur : Samatan, Gers, France 32130 ───────────────────────────────
OBSERVER_LAT  =  43.4934   # degrés Nord
OBSERVER_LON  =   0.9272   # degrés Est
OBSERVER_ELEV =  190       # mètres (altitude approximative)

# ─── Sources TLE pour la capsule Orion ───────────────────────────────────────
# NORAD IDs connus pour les missions Orion/Artemis :
#   Artemis I  : 54741 (2022)
#   Artemis II : cherché dynamiquement par nom
ORION_NORAD_IDS = [54741, 57466, 58000]  # IDs potentiels

CELESTRAK_NORAD  = "https://celestrak.org/satcat/tle.php?CATNR={}"
CELESTRAK_NAME   = "https://celestrak.org/SOCRATES/query.php?CODE={}&FORMAT=TLE"
CELESTRAK_SEARCH = [
    "https://celestrak.org/cgi-bin/TLE.cgi?CATNR={}",
    "https://celestrak.org/satcat/tle.php?CATNR={}",
]

# ─── Catalogue d'étoiles brillantes (nom, RA heures, Dec degrés, magnitude) ──
STARS = [
    ("Sirius",          6.7525,  -16.7161,  -1.46),
    ("Canopus",         6.3992,  -52.6957,  -0.72),
    ("Rigil Kentaurus", 14.6600, -60.8353,  -0.27),
    ("Arcturus",       14.2610,   19.1822,  -0.05),
    ("Vega",           18.6157,   38.7836,   0.03),
    ("Capella",         5.2782,   45.9980,   0.08),
    ("Rigel",           5.2423,   -8.2016,   0.12),
    ("Procyon",         7.6550,    5.2250,   0.38),
    ("Achernar",        1.6285,  -57.2367,   0.46),
    ("Betelgeuse",      5.9195,    7.4071,   0.50),
    ("Altair",         19.8468,    8.8683,   0.77),
    ("Acrux",          12.4433,  -63.0991,   0.77),
    ("Aldebaran",       4.5987,   16.5093,   0.85),
    ("Antares",        16.4901,  -26.4320,   0.96),
    ("Spica",          13.4199,  -11.1613,   0.98),
    ("Pollux",          7.7553,   28.0262,   1.14),
    ("Fomalhaut",      22.9608,  -29.6222,   1.16),
    ("Deneb",          20.6905,   45.2803,   1.25),
    ("Regulus",        10.1395,   11.9672,   1.35),
    ("Castor",          7.5767,   31.8883,   1.57),
    ("Bellatrix",       5.4185,    6.3497,   1.64),
    ("Elnath",          5.4382,   28.6075,   1.65),
    ("Alnilam",         5.6036,   -1.2019,   1.70),
    ("Alnitak",         5.6791,   -1.9426,   1.77),
    ("Alioth",         12.9004,   55.9600,   1.77),
    ("Dubhe",          11.0621,   61.7510,   1.79),
    ("Mirfak",          3.4054,   49.8612,   1.79),
    ("Alkaid",         13.7923,   49.3133,   1.86),
    ("Alhena",          6.6285,   16.3993,   1.93),
    ("Peacock",        20.4274,  -56.7350,   1.94),
    ("Mirzam",          6.3783,  -17.9559,   1.98),
    ("Polaris",         2.5300,   89.2641,   1.97),
    ("Alphard",         9.4597,   -8.6586,   1.98),
    ("Hamal",           2.1195,   23.4624,   2.00),
    ("Diphda",          0.7264,  -17.9866,   2.02),
    ("Nunki",          18.9211,  -26.2967,   2.02),
    ("Menkent",        14.1114,  -36.3700,   2.06),
    ("Alpheratz",       0.1397,   29.0905,   2.06),
    ("Mirach",          1.1622,   35.6204,   2.07),
    ("Kochab",         14.8451,   74.1555,   2.07),
    ("Rasalhague",     17.5822,   12.5600,   2.08),
    ("Algol",           3.1361,   40.9557,   2.09),
    ("Denebola",       11.8175,   14.5720,   2.14),
    ("Schedar",         0.6751,   56.5373,   2.24),
    ("Eltanin",        17.9434,   51.4889,   2.24),
    ("Mintaka",         5.5332,   -0.2991,   2.25),
    ("Mizar",          13.3988,   54.9254,   2.27),
    ("Caph",            0.1528,   59.1498,   2.27),
    ("Phecda",         11.8971,   53.6948,   2.44),
    ("Megrez",         12.2570,   57.0325,   3.31),
    ("Phad",           11.8971,   53.6948,   2.44),
    ("Merak",          11.0307,   56.3824,   2.37),
    ("Alphecta",       15.5781,   26.7148,   2.23),
    ("Sadalsuud",      21.5260,   -5.5712,   2.91),
    ("Alderamin",      21.3096,   62.5855,   2.45),
    ("Enif",           21.7364,    9.8750,   2.38),
    ("Sadalmelik",     22.0961,   -0.3198,   2.96),
    ("Markab",         23.0794,   15.2053,   2.49),
    ("Scheat",         23.0629,   28.0823,   2.42),
    ("Algenib",         0.2211,   15.1836,   2.83),
    ("Menkib",          3.9151,   35.7910,   3.99),
]


def angular_distance_deg(ra1_h, dec1_deg, ra2_h, dec2_deg):
    """Distance angulaire entre deux points célestes (degrés)."""
    ra1  = math.radians(ra1_h  * 15.0)
    dec1 = math.radians(dec1_deg)
    ra2  = math.radians(ra2_h  * 15.0)
    dec2 = math.radians(dec2_deg)
    cos_d = (math.sin(dec1) * math.sin(dec2) +
             math.cos(dec1) * math.cos(dec2) * math.cos(ra1 - ra2))
    cos_d = max(-1.0, min(1.0, cos_d))
    return math.degrees(math.acos(cos_d))


def nearest_star(ra_h, dec_deg):
    """Retourne l'étoile brillante la plus proche de la position céleste donnée."""
    best_name, best_dist, best_mag = None, 360.0, 0.0
    for name, s_ra, s_dec, mag in STARS:
        d = angular_distance_deg(ra_h, dec_deg, s_ra, s_dec)
        if d < best_dist:
            best_dist = d
            best_name = name
            best_mag  = mag
    return best_name, best_dist, best_mag


def fetch_tle(norad_id):
    """Tente de récupérer le TLE depuis Celestrak pour un NORAD ID donné."""
    for url_tmpl in CELESTRAK_SEARCH:
        try:
            url = url_tmpl.format(norad_id)
            resp = requests.get(url, timeout=3)
            if resp.status_code == 200:
                lines = [l.strip() for l in resp.text.strip().splitlines() if l.strip()]
                if len(lines) >= 2:
                    # Cherche deux lignes TLE consécutives
                    for i in range(len(lines) - 1):
                        if lines[i].startswith("1 ") and lines[i+1].startswith("2 "):
                            name = lines[i-1] if i > 0 else f"ORION-{norad_id}"
                            return name.strip(), lines[i], lines[i+1]
        except Exception:
            continue
    return None


def fetch_orion_tle():
    """Cherche le TLE d'Orion parmi les NORAD IDs connus."""
    print(f"{C_INFO}Recherche du TLE Orion sur Celestrak...{C_RESET}")
    for norad_id in ORION_NORAD_IDS:
        result = fetch_tle(norad_id)
        if result:
            print(f"{C_VALUE}TLE trouvé : NORAD {norad_id} → {result[0]}{C_RESET}")
            return result
    return None


# ─── Identifiants JPL Horizons pour les missions Orion/Artemis ───────────────
# Utilisés quand Orion est en trajectoire lunaire (hors orbite terrestre)
HORIZONS_IDS = ['-1024', '-1023', '-242', '-1041', '-1014', '-23', '-1009', '-1015', '-164']
# -1024 = Artemis II (Orion EM-2) — mission lunaire active

def _search_horizons_ids(keyword):
    """Cherche les IDs spacecraft dans Horizons correspondant à un mot-clé."""
    try:
        resp = requests.get('https://ssd.jpl.nasa.gov/api/horizons.api', params={
            'format': 'text', 'COMMAND': f"'{keyword}'",
            'MAKE_EPHEM': 'NO', 'OBJ_DATA': 'YES',
        }, timeout=15)
        ids = []
        for line in resp.text.splitlines():
            parts = line.strip().split()
            if parts and parts[0].lstrip('-').isdigit() and parts[0].startswith('-'):
                ids.append(parts[0])
        return ids
    except Exception:
        return []

def fetch_orion_horizons(lat_deg=OBSERVER_LAT, lon_deg=OBSERVER_LON, elev_m=OBSERVER_ELEV):
    """
    Récupère la position d'Orion via JPL Horizons (NASA).
    Utilisé pour les trajectoires lunaires/interplanétaires.
    Retourne (sc_id, az_deg, alt_deg, dist_km) ou None.
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today    = now.strftime('%Y-%m-%d')
    tomorrow = (now + timedelta(days=1)).strftime('%Y-%m-%d')
    base = 'https://ssd.jpl.nasa.gov/api/horizons.api'

    # Si les IDs fixes échouent, cherche dynamiquement par nom
    ids_to_try = list(HORIZONS_IDS)

    def _try_ids(ids):
        for sc_id in ids:
            try:
                url = (
                    f"{base}?format=text&COMMAND={sc_id}&OBJ_DATA=NO"
                    f"&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&CENTER=coord@399"
                    f"&SITE_COORD=%27{lon_deg}%2C{lat_deg}%2C{elev_m/1000:.3f}%27"
                    f"&START_TIME={today}&STOP_TIME={tomorrow}"
                    f"&STEP_SIZE=1h&QUANTITIES=4"
                )
                resp = requests.get(url, timeout=15)
                text = resp.text
                if '$$SOE' not in text or '$$EOE' not in text:
                    continue
                soe = text.index('$$SOE') + 5
                eoe = text.index('$$EOE')
                lines = [l for l in text[soe:eoe].strip().splitlines() if l.strip()]
                if not lines:
                    continue
                # Prendre la ligne la plus proche de l'heure actuelle
                best = lines[0]
                now_h = now.hour + now.minute / 60.0
                for l in lines:
                    parts = l.split()
                    if len(parts) >= 2 and ':' in parts[1]:
                        hh, mm = parts[1].split(':')
                        lh = int(hh) + int(mm) / 60.0
                        if abs(lh - now_h) < abs(
                                int(best.split()[1].split(':')[0]) +
                                int(best.split()[1].split(':')[1]) / 60.0 - now_h):
                            best = l
                nums = []
                for tok in best.split()[2:]:
                    try:
                        nums.append(float(tok))
                    except ValueError:
                        pass
                if len(nums) >= 2:
                    return sc_id, nums[0], nums[1], None  # dist inconnue en mode Horizons
            except Exception:
                continue
        return None

    result = _try_ids(ids_to_try)
    if result:
        return result

    # Recherche dynamique par nom si les IDs fixes ont tous échoué
    for keyword in ('Artemis', 'Orion'):
        found = _search_horizons_ids(keyword)
        if found:
            result = _try_ids(found)
            if result:
                return result

    return None




def _altaz_to_radec(alt_deg, az_deg):
    """Conversion Alt/Az → RA/Dec approx. (pure Python, sans Skyfield)."""
    now = datetime.now(timezone.utc)
    n   = (now - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400.0
    T   = n / 36525.0
    GMST = (6.697374558 + 2400.0513369 * T + 0.0000258622 * T**2) % 24.0
    LST  = (GMST + OBSERVER_LON / 15.0) % 24.0

    lat_r = math.radians(OBSERVER_LAT)
    alt_r = math.radians(alt_deg)
    az_r  = math.radians(az_deg)

    dec_r = math.asin(math.sin(lat_r) * math.sin(alt_r) -
                      math.cos(lat_r) * math.cos(alt_r) * math.cos(az_r))
    cos_H = ((math.sin(alt_r) - math.sin(lat_r) * math.sin(dec_r)) /
             (math.cos(lat_r) * math.cos(dec_r) + 1e-12))
    H_r = math.acos(max(-1.0, min(1.0, cos_H)))
    if math.sin(az_r) > 0:
        H_r = 2 * math.pi - H_r
    ra_h    = (LST - math.degrees(H_r) / 15.0) % 24.0
    dec_deg = math.degrees(dec_r)
    return ra_h, dec_deg


def run_tracker_horizons(sc_id):
    """Boucle de suivi via JPL Horizons (trajectoire lunaire)."""
    print(f"\n{C_INFO}Suivi JPL Horizons démarré. Ctrl+C pour quitter.{C_RESET}")
    print(f"{C_INFO}(Trajectoire lunaire : actualisation toutes les 60s){C_RESET}\n")
    time.sleep(1)

    while True:
        try:
            result = fetch_orion_horizons()
            if not result:
                print(f"{C_WARN}Données Horizons indisponibles, nouvelle tentative dans 30s...{C_RESET}")
                time.sleep(30)
                continue

            _, az_deg, alt_deg, dist_km = result
            ra_h, dec_deg = _altaz_to_radec(alt_deg, az_deg)
            star_name, star_dist, star_mag = nearest_star(ra_h, dec_deg)
            sun_alt, sun_status = sun_altitude_deg(OBSERVER_LAT, OBSERVER_LON)
            visible = alt_deg > 0
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

            print_header()
            print(f"{C_LABEL}  Source       : {C_VALUE}JPL Horizons — trajectoire lunaire{C_RESET}")
            print(f"{C_LABEL}  Heure UTC    : {C_VALUE}{now_str}{C_RESET}")
            print()

            if visible and sun_status == "nuit":
                print(f"{C_STAR}  🌙  OBSERVABLE — nuit astronomique{C_RESET}")
            elif visible and sun_status in ("crépuscule", "aube/crépuscule"):
                print(f"{C_LABEL}  🌅  AU-DESSUS — crépuscule{C_RESET}")
            elif visible:
                print(f"{C_INFO}  ☀️  AU-DESSUS DE L'HORIZON — jour{C_RESET}")
            else:
                print(f"{C_WARN}  ❌  Orion est sous l'horizon ({alt_deg:.1f}°){C_RESET}")

            print()
            print(f"{C_LABEL}  ─── Position dans le ciel ──────────────────────{C_RESET}")
            print(f"{C_LABEL}  Azimut       : {C_VALUE}{az_deg:7.3f}°  ({direction_label(az_deg)}){C_RESET}")
            print(f"{C_LABEL}  Hauteur      : {C_VALUE}{visibility_bar(alt_deg)}{C_RESET}")
            dist_str = f"{dist_km:,.0f} km" if dist_km else "inconnue"
            print(f"{C_LABEL}  Distance     : {C_VALUE}{dist_str}{C_RESET}")
            print()
            print(f"{C_LABEL}  ─── Coordonnées équatoriales (J2000) ───────────{C_RESET}")
            print(f"{C_LABEL}  Asc. droite  : {C_VALUE}{format_ra(ra_h)}{C_RESET}")
            print(f"{C_LABEL}  Déclinaison  : {C_VALUE}{format_dec(dec_deg)}{C_RESET}")
            print()
            print(f"{C_LABEL}  ─── Pointage Celestron 132mm ───────────────────{C_RESET}")
            print(f"{C_STAR}  ⭐  Étoile repère : {star_name}  "
                  f"(mag {star_mag:+.2f})  dist {star_dist:.1f}°{C_RESET}")
            print(f"{C_LABEL}  → Pointez sur {C_VALUE}{star_name}{C_LABEL}, "
                  f"décalez de {C_VALUE}{star_dist:.1f}°{C_LABEL} vers Orion{C_RESET}")
            print()
            print(f"{C_INFO}{'─'*60}")
            print(f"  Actualisation dans 60s  |  Ctrl+C pour quitter{C_RESET}")

            time.sleep(60)

        except KeyboardInterrupt:
            print(f"\n{C_INFO}Suivi arrêté.{C_RESET}")
            sys.exit(0)
        except Exception as e:
            print(f"{C_WARN}Erreur: {e}{C_RESET}")
            time.sleep(30)


def direction_label(az_deg):
    """Convertit un azimut en label cardinal."""
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]
    idx = round(az_deg / 22.5) % 16
    return dirs[idx]


def visibility_bar(alt_deg, width=20):
    """Barre de hauteur angulaire."""
    pct = max(0.0, min(1.0, alt_deg / 90.0))
    filled = int(pct * width)
    bar = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {alt_deg:+.1f}°"


def ra_dec_from_altaz(alt_deg, az_deg, lat_deg, lon_deg, ts_now):
    """
    Conversion Alt/Az → RA/Dec approximative pour trouver l'étoile repère.
    Utilise les formules sphériques standards.
    """
    lat = math.radians(lat_deg)
    alt = math.radians(alt_deg)
    az  = math.radians(az_deg)

    # Déclinaison
    dec = math.asin(math.sin(lat) * math.sin(alt) -
                    math.cos(lat) * math.cos(alt) * math.cos(az))

    # Angle horaire H
    cos_H = (math.sin(alt) - math.sin(lat) * math.sin(dec)) / (math.cos(lat) * math.cos(dec))
    cos_H = max(-1.0, min(1.0, cos_H))
    H = math.acos(cos_H)
    if math.sin(az) > 0:
        H = 2 * math.pi - H

    # Temps sidéral local (approximation)
    J2000 = 2451545.0
    now_utc = ts_now
    JD = J2000 + (now_utc.tt - 2451545.0)
    # GMST en heures
    T = (JD - 2451545.0) / 36525.0
    GMST = (6.697374558 + 2400.0513369 * T +
            0.0000258622 * T**2 - 1.7222e-9 * T**3) % 24.0
    LST = (GMST + lon_deg / 15.0) % 24.0

    # RA = LST - H
    RA_h = (LST - math.degrees(H) / 15.0) % 24.0
    Dec_deg = math.degrees(dec)

    return RA_h, Dec_deg


def print_header():
    os.system("clear" if os.name != "nt" else "cls")
    print(f"{C_TITLE}{'═'*60}")
    print(f"  🚀  ORION SPACECRAFT TRACKER  —  Samatan 32130, France")
    print(f"  🔭  Celestron 132mm motorisé")
    print(f"{'═'*60}{C_RESET}")


def format_ra(ra_h):
    h = int(ra_h)
    m = int((ra_h - h) * 60)
    s = ((ra_h - h) * 60 - m) * 60
    return f"{h:02d}h {m:02d}m {s:04.1f}s"


def format_dec(dec_deg):
    sign = "+" if dec_deg >= 0 else "-"
    d = abs(dec_deg)
    deg = int(d)
    m = int((d - deg) * 60)
    s = ((d - deg) * 60 - m) * 60
    return f"{sign}{deg:02d}° {m:02d}' {s:04.1f}\""


def run_tracker(tle_name, tle_line1, tle_line2):
    ts       = load.timescale()
    satellite = EarthSatellite(tle_line1, tle_line2, tle_name, ts)
    observer  = wgs84.latlon(OBSERVER_LAT, OBSERVER_LON, OBSERVER_ELEV)

    print(f"\n{C_INFO}Suivi démarré. Appuyez sur Ctrl+C pour quitter.{C_RESET}\n")
    time.sleep(1)

    while True:
        try:
            t = ts.now()
            difference = satellite - observer
            topocentric = difference.at(t)
            alt, az, dist = topocentric.altaz()

            alt_deg  = alt.degrees
            az_deg   = az.degrees
            dist_km  = dist.km

            # RA/Dec depuis les coordonnées topocentriques
            ra_angle, dec_angle, _ = topocentric.radec()
            ra_h    = ra_angle.hours
            dec_deg = dec_angle.degrees

            # Vitesse approximative du satellite
            t2 = ts.tt_jd(t.tt + 1.0 / 86400.0)
            diff2 = satellite - observer
            topo2 = diff2.at(t2)
            alt2, az2, dist2 = topo2.altaz()
            delta_az  = (az2.degrees - az_deg + 180) % 360 - 180
            delta_alt = alt2.degrees - alt_deg

            star_name, star_dist, star_mag = nearest_star(ra_h, dec_deg)
            visible = alt_deg > 0
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

            print_header()
            print(f"{C_LABEL}  Satellite    : {C_VALUE}{tle_name}{C_RESET}")
            print(f"{C_LABEL}  Heure UTC    : {C_VALUE}{now_str}{C_RESET}")
            print()

            if visible:
                print(f"{C_VALUE}  ✅  Orion est AU-DESSUS DE L'HORIZON{C_RESET}")
            else:
                print(f"{C_WARN}  ❌  Orion est sous l'horizon ({alt_deg:.1f}°){C_RESET}")

            print()
            print(f"{C_LABEL}  ─── Position dans le ciel ──────────────────────{C_RESET}")
            print(f"{C_LABEL}  Azimut       : {C_VALUE}{az_deg:7.3f}°  ({direction_label(az_deg)}){C_RESET}")
            print(f"{C_LABEL}  Hauteur      : {C_VALUE}{visibility_bar(alt_deg)}{C_RESET}")
            dist_str = f"{dist_km:,.0f} km" if dist_km else "inconnue"
            print(f"{C_LABEL}  Distance     : {C_VALUE}{dist_str}{C_RESET}")
            print()
            print(f"{C_LABEL}  ─── Coordonnées équatoriales (J2000) ───────────{C_RESET}")
            print(f"{C_LABEL}  Asc. droite  : {C_VALUE}{format_ra(ra_h)}{C_RESET}")
            print(f"{C_LABEL}  Déclinaison  : {C_VALUE}{format_dec(dec_deg)}{C_RESET}")
            print()
            print(f"{C_LABEL}  ─── Mouvement (par seconde) ────────────────────{C_RESET}")
            print(f"{C_LABEL}  ΔAzimut      : {C_VALUE}{delta_az:+.4f}°/s{C_RESET}")
            print(f"{C_LABEL}  ΔHauteur     : {C_VALUE}{delta_alt:+.4f}°/s{C_RESET}")
            print()
            print(f"{C_LABEL}  ─── Pointage Celestron 132mm ───────────────────{C_RESET}")
            print(f"{C_STAR}  ⭐  Étoile repère : {star_name}  "
                  f"(mag {star_mag:+.2f})  dist {star_dist:.1f}°{C_RESET}")
            print(f"{C_LABEL}  → Pointez sur {C_VALUE}{star_name}{C_LABEL}, "
                  f"puis décalez de {C_VALUE}{star_dist:.1f}°{C_LABEL} "
                  f"vers Orion{C_RESET}")
            print()

            if not visible:
                print(f"{C_INFO}  ℹ  Orion n'est pas observable depuis Samatan en ce moment.")
                print(f"     Prochaine fenêtre possible au lever du soleil ou la nuit.{C_RESET}")

            print(f"{C_INFO}{'─'*60}")
            print(f"  Actualisation toutes les 5s  |  Ctrl+C pour quitter{C_RESET}")

            time.sleep(5)

        except KeyboardInterrupt:
            print(f"\n{C_INFO}Suivi arrêté.{C_RESET}")
            sys.exit(0)
        except Exception as e:
            print(f"{C_WARN}Erreur: {e}{C_RESET}")
            time.sleep(5)


def demo_mode():
    """Mode démonstration avec un TLE simulé si Orion n'est pas en orbite."""
    print(f"\n{C_WARN}⚠  Aucun TLE Orion trouvé sur Celestrak.{C_RESET}")
    print(f"{C_INFO}   Orion n'est probablement pas en orbite actuellement.")
    print(f"   (Les missions Artemis sont ponctuelles)")
    print()
    print(f"   Options :")
    print(f"   1) Entrer manuellement les lignes TLE")
    print(f"   2) Utiliser l'ISS comme démonstration")
    print(f"   3) Quitter{C_RESET}")
    print()

    choice = input("Votre choix (1/2/3) : ").strip()

    if choice == "1":
        print("Entrez le nom du satellite :")
        name = input("> ").strip()
        print("Ligne TLE 1 (commence par '1 ') :")
        line1 = input("> ").strip()
        print("Ligne TLE 2 (commence par '2 ') :")
        line2 = input("> ").strip()
        if line1.startswith("1 ") and line2.startswith("2 "):
            run_tracker(name, line1, line2)
        else:
            print(f"{C_WARN}TLE invalide.{C_RESET}")
            sys.exit(1)

    elif choice == "2":
        print(f"\n{C_INFO}Téléchargement du TLE ISS...{C_RESET}")
        try:
            resp = requests.get(
                "https://celestrak.org/SOCRATES/query.php?CODE=25544&FORMAT=TLE",
                timeout=10)
            if resp.status_code != 200:
                # Fallback URL
                resp = requests.get(
                    "https://celestrak.org/satcat/tle.php?CATNR=25544",
                    timeout=10)
            lines = [l.strip() for l in resp.text.strip().splitlines() if l.strip()]
            for i in range(len(lines) - 1):
                if lines[i].startswith("1 ") and lines[i+1].startswith("2 "):
                    name = lines[i-1] if i > 0 else "ISS (ZARYA)"
                    run_tracker(name.strip(), lines[i], lines[i+1])
                    return
            print(f"{C_WARN}Impossible de récupérer le TLE ISS.{C_RESET}")
            sys.exit(1)
        except Exception as e:
            print(f"{C_WARN}Erreur réseau : {e}{C_RESET}")
            sys.exit(1)

    else:
        print("Au revoir.")
        sys.exit(0)


def main():
    print_header()
    print(f"\n{C_INFO}  Observateur : Samatan, Gers (43.4934°N, 0.9272°E, ~190m){C_RESET}\n")

    # 1. Essai TLE Celestrak (si Orion est en orbite terrestre)
    result = fetch_orion_tle()
    if result:
        name, line1, line2 = result
        run_tracker(name, line1, line2)
        return

    # 2. Essai JPL Horizons (si Orion est en trajectoire lunaire)
    print(f"{C_INFO}TLE non trouvé — Orion est peut-être en trajectoire lunaire.")
    print(f"Connexion à JPL Horizons (NASA)...{C_RESET}")
    horizons = fetch_orion_horizons()
    if horizons:
        sc_id, az, alt, dist = horizons
        print(f"{C_VALUE}✅  Position Orion trouvée via Horizons !")
        dist_str = f"{dist:,.0f} km" if dist else "inconnue"
        print(f"    Az={az:.1f}°  Alt={alt:.1f}°  Dist={dist_str}{C_RESET}")
        time.sleep(2)
        run_tracker_horizons(sc_id)
        return

    # 3. Mode démo
    demo_mode()


if __name__ == "__main__":
    main()
