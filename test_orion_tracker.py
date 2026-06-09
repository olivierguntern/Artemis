#!/usr/bin/env python3
"""
Suite de tests pour orion_tracker.py
Couvre : calculs astronomiques, parsing TLE, recherche d'étoiles,
         formatage, fetch réseau (mocké), intégration skyfield.
"""

import pytest
import math
import sys
import os
from unittest.mock import patch, MagicMock

# ─── TLE de référence (ISS, époque connue) ───────────────────────────────────
TLE_ISS_NAME  = "ISS (ZARYA)"
TLE_ISS_LINE1 = "1 25544U 98067A   24010.54791667  .00016717  00000-0  31088-3 0  9993"
TLE_ISS_LINE2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50000000435870"

# TLE fictif mais valide pour tests unitaires
TLE_FAKE_NAME  = "ORION-TEST"
TLE_FAKE_LINE1 = "1 54741U 22156A   22335.54791667  .00000000  00000-0  00000-0 0  9991"
TLE_FAKE_LINE2 = "2 54741  28.5000 180.0000 0020000  90.0000 270.0000  1.00000000  1234"

# ─── Imports du module testé ─────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from orion_tracker import (
    angular_distance_deg,
    nearest_star,
    direction_label,
    visibility_bar,
    format_ra,
    format_dec,
    ra_dec_from_altaz,
    fetch_tle,
    STARS,
    OBSERVER_LAT,
    OBSERVER_LON,
    OBSERVER_ELEV,
)


# ═════════════════════════════════════════════════════════════════════════════
# 1. TESTS DE DISTANCE ANGULAIRE
# ═════════════════════════════════════════════════════════════════════════════

class TestAngularDistance:

    def test_meme_point(self):
        """Distance d'un point à lui-même ≈ 0 (précision flottante)."""
        assert angular_distance_deg(6.7525, -16.7161, 6.7525, -16.7161) == pytest.approx(0.0, abs=1e-6)

    def test_poles_nord_sud(self):
        """Distance entre pôle Nord et pôle Sud = 180°."""
        d = angular_distance_deg(0.0, 90.0, 0.0, -90.0)
        assert d == pytest.approx(180.0, abs=1e-6)

    def test_equateur_90_deg(self):
        """Deux points sur l'équateur séparés de 6h en RA = 90°."""
        d = angular_distance_deg(0.0, 0.0, 6.0, 0.0)
        assert d == pytest.approx(90.0, abs=1e-6)

    def test_equateur_180_deg(self):
        """Deux points opposés sur l'équateur = 180°."""
        d = angular_distance_deg(0.0, 0.0, 12.0, 0.0)
        assert d == pytest.approx(180.0, abs=1e-6)

    def test_symetrie(self):
        """La distance est symétrique."""
        d1 = angular_distance_deg(5.0, 20.0, 18.0, -30.0)
        d2 = angular_distance_deg(18.0, -30.0, 5.0, 20.0)
        assert d1 == pytest.approx(d2, rel=1e-9)

    def test_sirius_betelgeuse(self):
        """Distance Sirius–Betelgeuse (~22° connue)."""
        d = angular_distance_deg(6.7525, -16.7161, 5.9195, 7.4071)
        assert 20.0 < d < 28.0

    def test_polaris_kochab(self):
        """Polaris et Kochab : séparation ~16°."""
        d = angular_distance_deg(2.5300, 89.2641, 14.8451, 74.1555)
        assert 14.0 < d < 18.0

    def test_voisins_proches(self):
        """Deux étoiles très proches → distance < 1°."""
        d = angular_distance_deg(5.6036, -1.2019, 5.6791, -1.9426)  # Alnilam–Alnitak
        assert d < 2.0

    def test_resultat_positif(self):
        """La distance angulaire est toujours positive."""
        for ra1, dec1, ra2, dec2 in [
            (0.0, 0.0, 12.0, 0.0),
            (3.0, 45.0, 21.0, -45.0),
            (0.0, 90.0, 12.0, 90.0),
        ]:
            assert angular_distance_deg(ra1, dec1, ra2, dec2) >= 0.0

    def test_limites_declination(self):
        """Pas d'erreur mathématique aux pôles."""
        d = angular_distance_deg(0.0, 89.9, 12.0, 89.9)
        assert 0.0 <= d <= 180.0


# ═════════════════════════════════════════════════════════════════════════════
# 2. TESTS DE RECHERCHE D'ÉTOILE REPÈRE
# ═════════════════════════════════════════════════════════════════════════════

class TestNearestStar:

    def test_retourne_etoile_connue(self):
        """nearest_star retourne bien un nom, une distance et une magnitude."""
        name, dist, mag = nearest_star(18.6157, 38.7836)
        assert isinstance(name, str)
        assert len(name) > 0
        assert 0.0 <= dist <= 180.0
        assert -5.0 < mag < 10.0

    def test_vega_sur_vega(self):
        """Sur les coordonnées exactes de Vega → Vega à 0°."""
        name, dist, mag = nearest_star(18.6157, 38.7836)
        assert name == "Vega"
        assert dist == pytest.approx(0.0, abs=0.01)

    def test_sirius_sur_sirius(self):
        """Sur les coordonnées exactes de Sirius → Sirius."""
        name, dist, mag = nearest_star(6.7525, -16.7161)
        assert name == "Sirius"
        assert dist == pytest.approx(0.0, abs=0.01)

    def test_polaris_sur_polaris(self):
        """Sur Polaris → Polaris."""
        name, dist, mag = nearest_star(2.5300, 89.2641)
        assert name == "Polaris"

    def test_distance_positive(self):
        """La distance est toujours positive."""
        for ra, dec in [(0.0, 0.0), (6.0, 30.0), (18.0, -45.0)]:
            _, dist, _ = nearest_star(ra, dec)
            assert dist >= 0.0

    def test_etoile_la_plus_proche_logique(self):
        """L'étoile retournée est bien la plus proche parmi toutes."""
        ra, dec = 10.0, 20.0
        name, dist, _ = nearest_star(ra, dec)
        # Vérifie qu'aucune autre étoile n'est plus proche
        for s_name, s_ra, s_dec, _ in STARS:
            d = angular_distance_deg(ra, dec, s_ra, s_dec)
            assert d >= dist - 1e-9, f"{s_name} ({d:.3f}°) plus proche que {name} ({dist:.3f}°)"

    def test_region_orion(self):
        """Dans la région d'Orion → une des étoiles d'Orion."""
        name, dist, _ = nearest_star(5.6, -1.0)
        orion_stars = {"Betelgeuse", "Rigel", "Alnilam", "Alnitak", "Mintaka", "Bellatrix"}
        assert name in orion_stars, f"Attendu une étoile d'Orion, obtenu {name}"

    def test_catalogues_non_vide(self):
        """Le catalogue contient au moins 40 étoiles."""
        assert len(STARS) >= 40

    def test_magnitude_coherente(self):
        """Toutes les magnitudes du catalogue sont dans [-2, 4]."""
        for name, ra, dec, mag in STARS:
            assert -2.0 <= mag <= 4.0, f"{name} a une magnitude aberrante : {mag}"


# ═════════════════════════════════════════════════════════════════════════════
# 3. TESTS DE FORMATAGE
# ═════════════════════════════════════════════════════════════════════════════

class TestDirectionLabel:

    CASES = [
        (0.0,   "N"),
        (22.5,  "NNE"),
        (45.0,  "NE"),
        (90.0,  "E"),
        (135.0, "SE"),
        (180.0, "S"),
        (225.0, "SO"),
        (270.0, "O"),
        (315.0, "NO"),
        (337.5, "NNO"),
        (360.0, "N"),
    ]

    @pytest.mark.parametrize("az,expected", CASES)
    def test_directions(self, az, expected):
        assert direction_label(az) == expected

    def test_valeurs_intermediaires(self):
        """Valeurs intermédiaires retournent une direction valide."""
        valid = {"N","NNE","NE","ENE","E","ESE","SE","SSE",
                 "S","SSO","SO","OSO","O","ONO","NO","NNO"}
        for az in range(0, 360, 7):
            assert direction_label(az) in valid


class TestVisibilityBar:

    def test_sous_horizon(self):
        """Altitude négative → barre vide."""
        bar = visibility_bar(-10)
        assert "░" * 20 in bar or "░" in bar

    def test_zenith(self):
        """Altitude 90° → barre pleine."""
        bar = visibility_bar(90)
        assert "█" * 20 in bar

    def test_mi_hauteur(self):
        """Altitude 45° → barre à moitié pleine."""
        bar = visibility_bar(45)
        assert "█" in bar and "░" in bar

    def test_contient_valeur_numerique(self):
        """La barre contient la valeur d'altitude."""
        assert "+45.0°" in visibility_bar(45)
        assert "-10.0°" in visibility_bar(-10)
        assert "+0.0°" in visibility_bar(0)


class TestFormatRA:

    def test_zero(self):
        assert format_ra(0.0) == "00h 00m 00.0s"

    def test_vega(self):
        """RA de Vega ≈ 18h 36m."""
        result = format_ra(18.6157)
        assert result.startswith("18h 36m")

    def test_format_deux_chiffres(self):
        """Les heures et minutes sont toujours sur 2 chiffres."""
        r = format_ra(1.5)
        assert r.startswith("01h")

    def test_24h(self):
        """24h = 24h 00m 0.0s."""
        result = format_ra(24.0)
        assert "24h" in result


class TestFormatDec:

    def test_zero(self):
        assert format_dec(0.0).startswith("+")

    def test_positif(self):
        result = format_dec(38.7836)
        assert result.startswith("+38°")

    def test_negatif(self):
        result = format_dec(-16.7161)
        assert result.startswith("-16°")

    def test_pole_nord(self):
        result = format_dec(90.0)
        assert result.startswith("+90°")

    def test_signe_present(self):
        """Le signe est toujours présent."""
        assert format_dec(5.0)[0] in ("+", "-")
        assert format_dec(-5.0)[0] in ("+", "-")


# ═════════════════════════════════════════════════════════════════════════════
# 4. TESTS DE CONVERSION AltAz → RA/Dec
# ═════════════════════════════════════════════════════════════════════════════

class TestRaDecFromAltaz:

    def setup_method(self):
        from skyfield.api import load
        self.ts = load.timescale()
        self.t = self.ts.utc(2024, 1, 15, 22, 0, 0)

    def test_retourne_deux_valeurs(self):
        ra, dec = ra_dec_from_altaz(45.0, 180.0, OBSERVER_LAT, OBSERVER_LON, self.t)
        assert isinstance(ra, float)
        assert isinstance(dec, float)

    def test_ra_dans_intervalle(self):
        """RA doit être dans [0, 24[."""
        for alt, az in [(10, 0), (30, 90), (60, 270), (80, 180)]:
            ra, dec = ra_dec_from_altaz(alt, az, OBSERVER_LAT, OBSERVER_LON, self.t)
            assert 0.0 <= ra < 24.0, f"RA={ra} hors intervalle pour alt={alt} az={az}"

    def test_dec_dans_intervalle(self):
        """Dec doit être dans [-90, 90]."""
        for alt, az in [(10, 0), (30, 90), (60, 270), (80, 180)]:
            ra, dec = ra_dec_from_altaz(alt, az, OBSERVER_LAT, OBSERVER_LON, self.t)
            assert -90.0 <= dec <= 90.0, f"Dec={dec} hors intervalle"

    def test_zenith_dec_proche_latitude(self):
        """Au zénith, la déclinaison ≈ latitude de l'observateur."""
        ra, dec = ra_dec_from_altaz(90.0, 0.0, OBSERVER_LAT, OBSERVER_LON, self.t)
        assert abs(dec - OBSERVER_LAT) < 1.0, f"Dec zénith {dec} trop loin de la latitude {OBSERVER_LAT}"

    def test_coherence_nearest_star(self):
        """nearest_star ne plante pas sur les coordonnées converties."""
        ra, dec = ra_dec_from_altaz(45.0, 90.0, OBSERVER_LAT, OBSERVER_LON, self.t)
        name, dist, mag = nearest_star(ra, dec)
        assert name is not None
        assert 0.0 <= dist <= 180.0


# ═════════════════════════════════════════════════════════════════════════════
# 5. TESTS SKYFIELD — Calculs satellites (TLE embarqué)
# ═════════════════════════════════════════════════════════════════════════════

class TestSkyfieldCalculations:

    def setup_method(self):
        from skyfield.api import load, wgs84, EarthSatellite
        self.ts = load.timescale()
        self.satellite = EarthSatellite(TLE_ISS_LINE1, TLE_ISS_LINE2, TLE_ISS_NAME, self.ts)
        self.observer  = wgs84.latlon(OBSERVER_LAT, OBSERVER_LON, OBSERVER_ELEV)

    def test_satellite_cree_sans_erreur(self):
        """La création d'un satellite depuis un TLE valide ne lève pas d'exception."""
        from skyfield.api import load, EarthSatellite
        ts = load.timescale()
        sat = EarthSatellite(TLE_ISS_LINE1, TLE_ISS_LINE2, TLE_ISS_NAME, ts)
        assert sat is not None

    def test_altaz_retourne_trois_valeurs(self):
        """altaz() retourne bien (alt, az, dist)."""
        t = self.ts.utc(2024, 1, 10, 12, 0, 0)
        diff = self.satellite - self.observer
        topo = diff.at(t)
        alt, az, dist = topo.altaz()
        assert hasattr(alt, 'degrees')
        assert hasattr(az, 'degrees')
        assert hasattr(dist, 'km')

    def test_altitude_intervalle(self):
        """L'altitude retournée est dans [-90, 90]."""
        t = self.ts.utc(2024, 1, 10, 12, 0, 0)
        diff = self.satellite - self.observer
        topo = diff.at(t)
        alt, az, dist = topo.altaz()
        assert -90.0 <= alt.degrees <= 90.0

    def test_azimut_intervalle(self):
        """L'azimut est dans [0, 360]."""
        t = self.ts.utc(2024, 1, 10, 12, 0, 0)
        diff = self.satellite - self.observer
        topo = diff.at(t)
        alt, az, dist = topo.altaz()
        assert 0.0 <= az.degrees <= 360.0

    def test_distance_iss_raisonnable(self):
        """Distance ISS depuis le sol : entre 300 km (zénith) et ~13200 km (face opposée)."""
        t = self.ts.utc(2024, 1, 10, 12, 0, 0)
        diff = self.satellite - self.observer
        topo = diff.at(t)
        _, _, dist = topo.altaz()
        assert 300.0 <= dist.km <= 14000.0, f"Distance ISS aberrante : {dist.km} km"

    def test_radec_retourne_valeurs(self):
        """radec() retourne RA/Dec cohérents."""
        t = self.ts.utc(2024, 1, 10, 12, 0, 0)
        diff = self.satellite - self.observer
        topo = diff.at(t)
        ra_angle, dec_angle, _ = topo.radec()
        assert 0.0 <= ra_angle.hours < 24.0
        assert -90.0 <= dec_angle.degrees <= 90.0

    def test_mouvement_detecte(self):
        """Le satellite bouge entre deux instants successifs."""
        t1 = self.ts.utc(2024, 1, 10, 12, 0, 0)
        t2 = self.ts.utc(2024, 1, 10, 12, 0, 30)
        diff = self.satellite - self.observer
        alt1, az1, _ = diff.at(t1).altaz()
        alt2, az2, _ = diff.at(t2).altaz()
        # En 30 secondes, l'ISS se déplace d'au moins 0.01°
        delta = abs(az2.degrees - az1.degrees) + abs(alt2.degrees - alt1.degrees)
        assert delta > 0.01, "Le satellite ne semble pas se déplacer"

    def test_observateur_samatan(self):
        """La position de Samatan est correctement chargée."""
        from skyfield.api import wgs84
        obs = wgs84.latlon(OBSERVER_LAT, OBSERVER_LON, OBSERVER_ELEV)
        assert obs is not None

    def test_pipeline_complet(self):
        """Pipeline complet : TLE → Alt/Az → étoile repère."""
        t = self.ts.utc(2024, 1, 10, 20, 30, 0)  # nuit
        diff = self.satellite - self.observer
        topo = diff.at(t)
        alt, az, dist = topo.altaz()
        ra_angle, dec_angle, _ = topo.radec()
        ra_h   = ra_angle.hours
        dec_d  = dec_angle.degrees
        name, star_dist, mag = nearest_star(ra_h, dec_d)
        assert 0.0 <= ra_h < 24.0
        assert -90.0 <= dec_d <= 90.0
        assert name is not None
        assert 0.0 <= star_dist <= 180.0
        assert dist.km > 0


# ═════════════════════════════════════════════════════════════════════════════
# 6. TESTS RÉSEAU (avec mock)
# ═════════════════════════════════════════════════════════════════════════════

TLE_RESPONSE_VALID = (
    "ORION\n"
    "1 54741U 22156A   22335.54791667  .00000000  00000-0  00000-0 0  9991\n"
    "2 54741  28.5000 180.0000 0020000  90.0000 270.0000  1.00000000  1234\n"
)
TLE_RESPONSE_EMPTY = ""
TLE_RESPONSE_HTML  = "<!DOCTYPE html><html><head></head><body>404</body></html>"


class TestFetchTLE:

    @patch("orion_tracker.requests.get")
    def test_fetch_tle_succes(self, mock_get):
        """fetch_tle retourne (name, line1, line2) si le TLE est valide."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = TLE_RESPONSE_VALID
        mock_get.return_value = mock_resp

        result = fetch_tle(54741)
        assert result is not None
        name, line1, line2 = result
        assert line1.startswith("1 ")
        assert line2.startswith("2 ")

    @patch("orion_tracker.requests.get")
    def test_fetch_tle_404(self, mock_get):
        """fetch_tle retourne None si le serveur répond 404."""
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = TLE_RESPONSE_HTML
        mock_get.return_value = mock_resp

        result = fetch_tle(99999)
        assert result is None

    @patch("orion_tracker.requests.get")
    def test_fetch_tle_reponse_vide(self, mock_get):
        """fetch_tle retourne None si le corps est vide."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = TLE_RESPONSE_EMPTY
        mock_get.return_value = mock_resp

        result = fetch_tle(54741)
        assert result is None

    @patch("orion_tracker.requests.get", side_effect=Exception("timeout"))
    def test_fetch_tle_exception_reseau(self, mock_get):
        """fetch_tle retourne None en cas d'exception réseau."""
        result = fetch_tle(54741)
        assert result is None

    @patch("orion_tracker.requests.get")
    def test_fetch_tle_html_invalide(self, mock_get):
        """fetch_tle retourne None si la réponse est du HTML (pas un TLE)."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = TLE_RESPONSE_HTML
        mock_get.return_value = mock_resp

        result = fetch_tle(54741)
        assert result is None

    @patch("orion_tracker.requests.get")
    def test_fetch_tle_extrait_nom(self, mock_get):
        """fetch_tle extrait correctement le nom du satellite."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = TLE_RESPONSE_VALID
        mock_get.return_value = mock_resp

        result = fetch_tle(54741)
        assert result is not None
        name = result[0]
        assert "ORION" in name.upper() or len(name) > 0


# ═════════════════════════════════════════════════════════════════════════════
# 7. TESTS DE CONSTANTES ET CONFIGURATION
# ═════════════════════════════════════════════════════════════════════════════

class TestConfiguration:

    def test_latitude_samatan(self):
        """Latitude de Samatan dans les bornes attendues [43.0, 44.0]."""
        assert 43.0 <= OBSERVER_LAT <= 44.0

    def test_longitude_samatan(self):
        """Longitude de Samatan dans les bornes attendues [0.5, 1.5]."""
        assert 0.5 <= OBSERVER_LON <= 1.5

    def test_elevation_plausible(self):
        """Altitude de Samatan raisonnable pour le Gers [100, 400] m."""
        assert 100 <= OBSERVER_ELEV <= 400

    def test_etoiles_ra_valide(self):
        """Toutes les RA du catalogue sont dans [0, 24[."""
        for name, ra, dec, mag in STARS:
            assert 0.0 <= ra < 24.0, f"{name} a une RA invalide : {ra}"

    def test_etoiles_dec_valide(self):
        """Toutes les déclinaisons sont dans [-90, 90]."""
        for name, ra, dec, mag in STARS:
            assert -90.0 <= dec <= 90.0, f"{name} a une Dec invalide : {dec}"

    def test_etoiles_sans_doublons(self):
        """Pas de noms dupliqués dans le catalogue."""
        noms = [s[0] for s in STARS]
        assert len(noms) == len(set(noms)), "Doublons détectés dans le catalogue"

    def test_etoiles_brillantes_incluses(self):
        """Les 10 étoiles les plus brillantes sont dans le catalogue."""
        must_have = ["Sirius", "Canopus", "Arcturus", "Vega",
                     "Capella", "Rigel", "Procyon", "Betelgeuse", "Altair"]
        noms = {s[0] for s in STARS}
        for star in must_have:
            assert star in noms, f"{star} manquante dans le catalogue"


# ═════════════════════════════════════════════════════════════════════════════
# Point d'entrée direct
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-q"])
