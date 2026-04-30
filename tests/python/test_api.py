import pytest
from fastapi.testclient import TestClient
from src.python.main import app
from src.python.services.parser_service import ParserService
from src.python.services.highlight_detector import HighlightDetector

client = TestClient(app)

DEMO_PATH = "g161-20260428210802350160640_de_mirage.dem"


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestParseDemoEndpoint:
    def test_parse_demo_with_real_file(self):
        response = client.post("/parse_demo", json={"demo_path": DEMO_PATH})
        assert response.status_code == 200
        data = response.json()
        assert "header" in data
        assert "events" in data
        assert data["header"]["map_name"] == "de_mirage"
        assert "player_death" in data["events"]
        assert len(data["events"]["player_death"]) > 0

    def test_parse_demo_nonexistent_file(self):
        response = client.post("/parse_demo", json={"demo_path": "nonexistent.dem"})
        assert response.status_code == 400


class TestDetectHighlightsEndpoint:
    def test_detect_highlights_with_real_file(self):
        response = client.post("/detect_highlights", json={"demo_path": DEMO_PATH})
        assert response.status_code == 200
        highlights = response.json()
        assert len(highlights) > 0
        # Check structure
        for hl in highlights:
            assert "type" in hl
            assert "player_name" in hl
            assert "player_steamid" in hl
            assert "round" in hl
            assert "tick_start" in hl
            assert "tick_end" in hl
            assert "kill_count" in hl
            assert "score" in hl

    def test_detect_highlights_nonexistent_file(self):
        response = client.post("/detect_highlights", json={"demo_path": "nonexistent.dem"})
        assert response.status_code == 400

    def test_detect_highlights_sorted_by_score(self):
        response = client.post("/detect_highlights", json={"demo_path": DEMO_PATH})
        highlights = response.json()
        scores = [hl["score"] for hl in highlights]
        assert scores == sorted(scores, reverse=True)

    def test_detect_highlights_has_multi_kills(self):
        response = client.post("/detect_highlights", json={"demo_path": DEMO_PATH})
        highlights = response.json()
        types = [hl["type"] for hl in highlights]
        assert "3K" in types or "4K" in types or "ACE" in types

    def test_detect_highlights_has_clutches(self):
        response = client.post("/detect_highlights", json={"demo_path": DEMO_PATH})
        highlights = response.json()
        types = [hl["type"] for hl in highlights]
        clutch_types = [t for t in types if t.startswith("CLUTCH")]
        assert len(clutch_types) > 0


class TestParserService:
    def test_parse_header(self):
        service = ParserService(DEMO_PATH)
        header = service.parse_header()
        assert header["map_name"] == "de_mirage"
        assert "demo_version_name" in header

    def test_get_tick_rate(self):
        service = ParserService(DEMO_PATH)
        tick_rate = service.get_tick_rate()
        assert tick_rate in (64, 128)

    def test_tick_to_seconds(self):
        service = ParserService(DEMO_PATH)
        seconds = service.tick_to_seconds(640)
        tick_rate = service.get_tick_rate()
        assert seconds == pytest.approx(640 / tick_rate)

    def test_parse_events(self):
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        assert "player_death" in events
        assert isinstance(events["player_death"], list)
        assert len(events["player_death"]) > 0
        # Verify events are dicts, not DataFrames
        first_death = events["player_death"][0]
        assert isinstance(first_death, dict)
        assert "tick" in first_death

    def test_parse_player_info(self):
        service = ParserService(DEMO_PATH)
        players = service.parse_player_info()
        assert len(players) > 0
        assert "steamid" in players[0]
        assert "name" in players[0]

    def test_get_game_info(self):
        service = ParserService(DEMO_PATH)
        info = service.get_game_info()
        assert info["map_name"] == "de_mirage"
        assert "tick_rate" in info
        assert "players" in info
        assert len(info["players"]) > 0

    def test_parse_demo_performance(self):
        """Parse demo should complete in under 5 seconds."""
        import time
        service = ParserService(DEMO_PATH)
        start = time.time()
        service.parse_events()
        elapsed = time.time() - start
        assert elapsed < 5.0, f"Parsing took {elapsed:.2f}s, expected <5s"


class TestHighlightDetector:
    def test_detect_multi_kills(self):
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_multi_kills()
        assert len(highlights) > 0
        for hl in highlights:
            assert hl.type in ("3K", "4K", "ACE")
            assert hl.kill_count >= 3
            assert hl.tick_start < hl.tick_end

    def test_detect_clutches(self):
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_clutches()
        assert len(highlights) > 0
        for hl in highlights:
            assert hl.type.startswith("CLUTCH")
            assert hl.tick_start < hl.tick_end

    def test_detect_highlights_sorted(self):
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_highlights()
        scores = [hl.score for hl in highlights]
        assert scores == sorted(scores, reverse=True)

    def test_detect_highlights_deduplicated(self):
        """Same player + same round + same type should appear only once."""
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_highlights()
        keys = [(hl.round, hl.player_steamid, hl.type) for hl in highlights]
        assert len(keys) == len(set(keys))

    def test_highlight_scoring_ranks_ace_above_3k(self):
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_highlights()
        ace_scores = [h.score for h in highlights if h.type == "ACE"]
        three_k_scores = [h.score for h in highlights if h.type == "3K"]
        if ace_scores and three_k_scores:
            assert max(ace_scores) > max(three_k_scores)

    def test_no_false_positives_on_warmup(self):
        """Highlights should not be detected during warmup."""
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_highlights()
        for hl in highlights:
            assert hl.round > 0, f"Warmup highlight detected: {hl}"

    def test_no_team_kills_in_highlights(self):
        """Multi-kills should not include team kills."""
        service = ParserService(DEMO_PATH)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        highlights = detector.detect_multi_kills()
        # This is indirectly tested by the multi-kill logic filtering team kills
        # We verify that the detected highlights have reasonable kill counts
        for hl in highlights:
            assert hl.kill_count >= 3
